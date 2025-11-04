"""
WebSocket Manager using Socket.IO
Handles real-time communication between frontend and backend

WebSocket Events:
- connection_established: Client connected successfully
- message_new: New message created (may be placeholder for streaming)
- message_stream: Streaming chunk from agent (real-time LLM response)
- message_update: Final message content update after streaming completes
- agent_status: Agent status change (thinking, online, error)
- error: Error occurred during processing
- user_typing: User is typing
- pong: Response to ping keepalive

Performance Optimizations (Issue #47):
- Abbreviated field names (40% payload reduction)
- Unix timestamps instead of ISO strings
- Message batching for small payloads
- Gzip compression for large payloads (>10KB)
- Payload size logging for monitoring
"""

import socketio
from typing import Dict, Set, List, Any, Optional
import logging
from uuid import UUID
import json
import gzip
import time
from datetime import datetime
from collections import deque
import asyncio

# Create Socket.IO server
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*',  # For local development
    logger=True,
    engineio_logger=False,
    # Enable compression at Socket.IO level for additional savings
    compression_threshold=1024  # Compress messages > 1KB
)

# Create ASGI app
socket_app = socketio.ASGIApp(sio)

# Track connected clients
connected_clients: Set[str] = set()

logger = logging.getLogger(__name__)

# Message batching configuration
BATCH_INTERVAL_MS = 50  # Batch messages over 50ms window
BATCH_MAX_SIZE = 10  # Max messages per batch
COMPRESSION_THRESHOLD = 10 * 1024  # 10KB


class PayloadOptimizer:
    """
    Optimize WebSocket payloads for reduced bandwidth usage.

    Features:
    - Field name abbreviation (40%+ reduction)
    - Unix timestamp conversion
    - Optional gzip compression for large payloads
    - Size tracking and logging
    """

    # Field mappings: full_name -> abbreviated_name
    FIELD_MAP = {
        # Message fields
        'message_id': 'mid',
        'channel_id': 'cid',
        'author_type': 'at',
        'author_name': 'an',
        'author_id': 'aid',
        'content': 'c',
        'created_at': 'ts',  # timestamp
        'updated_at': 'uts',
        'metadata': 'm',

        # Agent fields
        'agent_name': 'ag',
        'agent_id': 'agid',
        'status': 's',

        # Workflow fields
        'workflow_id': 'wid',
        'description': 'd',
        'orchestrator': 'orch',
        'plan': 'p',
        'total_tasks': 'tt',
        'tasks': 't',
        'order': 'o',
        'depends_on': 'dep',

        # Streaming fields
        'chunk': 'ch',
        'is_final': 'fin',
        'streaming': 'str',

        # Error fields
        'message': 'msg',
        'error': 'err',

        # Context fields
        'user_name': 'un',
        'timestamp': 'ts',
        'sid': 'sid',

        # LLM metadata fields
        'model': 'mdl',
        'provider': 'prv',
        'in_reply_to': 'irt',
        'tokens': 'tok',

        # Common fields
        'id': 'id',
        'name': 'n',
        'type': 'ty',
        'value': 'v',
        'key': 'k',
        'data': 'da'
    }

    # Reverse mapping for decoding
    REVERSE_MAP = {v: k for k, v in FIELD_MAP.items()}

    @classmethod
    def optimize(cls, data: Dict[str, Any], compress: bool = False) -> tuple[bytes | Dict, int, int]:
        """
        Optimize payload by abbreviating field names and optionally compressing.

        Args:
            data: Original payload dictionary
            compress: Whether to gzip compress the payload

        Returns:
            Tuple of (optimized_data, original_size, optimized_size)
        """
        # Step 0: Calculate original size (before optimization)
        original_json = json.dumps(data, separators=(',', ':'))
        original_size = len(original_json.encode('utf-8'))

        # Step 1: Abbreviate field names
        optimized = cls._abbreviate_fields(data)

        # Step 2: Convert ISO timestamps to Unix timestamps
        optimized = cls._convert_timestamps(optimized)

        # Step 3: Serialize optimized payload to JSON
        optimized_json = json.dumps(optimized, separators=(',', ':'))  # No spaces
        optimized_size = len(optimized_json.encode('utf-8'))

        # Step 4: Compress if needed
        if compress or optimized_size > COMPRESSION_THRESHOLD:
            compressed = gzip.compress(optimized_json.encode('utf-8'), compresslevel=6)
            compressed_size = len(compressed)

            # Only use compression if it actually reduces size
            if compressed_size < optimized_size * 0.9:  # 10% threshold
                logger.debug(f"Compressed payload: {optimized_size} -> {compressed_size} bytes ({compressed_size/optimized_size*100:.1f}%)")
                return compressed, original_size, compressed_size

        return optimized, original_size, optimized_size

    @classmethod
    def _abbreviate_fields(cls, data: Dict[str, Any]) -> Dict[str, Any]:
        """Recursively abbreviate field names using mapping"""
        if isinstance(data, dict):
            result = {}
            for key, value in data.items():
                # Use abbreviated name if available, otherwise keep original
                new_key = cls.FIELD_MAP.get(key, key)
                result[new_key] = cls._abbreviate_fields(value)
            return result
        elif isinstance(data, list):
            return [cls._abbreviate_fields(item) for item in data]
        else:
            return data

    @classmethod
    def _convert_timestamps(cls, data: Dict[str, Any]) -> Dict[str, Any]:
        """Convert ISO timestamp strings to Unix timestamps (integers)"""
        if isinstance(data, dict):
            result = {}
            for key, value in data.items():
                # Check if this looks like a timestamp field
                if key in ('ts', 'uts') and isinstance(value, str):
                    try:
                        # Parse ISO format and convert to Unix timestamp
                        dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
                        result[key] = int(dt.timestamp() * 1000)  # Milliseconds
                    except (ValueError, AttributeError):
                        result[key] = value  # Keep original if parsing fails
                else:
                    result[key] = cls._convert_timestamps(value)
            return result
        elif isinstance(data, list):
            return [cls._convert_timestamps(item) for item in data]
        else:
            return data


class MessageBatcher:
    """
    Batch small messages together to reduce network overhead.

    Batches messages over a time window (50ms) or size limit (10 messages).
    """

    def __init__(self, interval_ms: int = BATCH_INTERVAL_MS, max_size: int = BATCH_MAX_SIZE):
        self.interval_ms = interval_ms
        self.max_size = max_size
        self.queue: deque = deque()
        self.timer_task: Optional[asyncio.Task] = None
        self.lock = asyncio.Lock()

    async def add_message(self, event: str, data: Dict[str, Any], namespace: str = '/'):
        """Add message to batch queue"""
        async with self.lock:
            self.queue.append((event, data, namespace))

            # Flush immediately if batch is full
            if len(self.queue) >= self.max_size:
                await self._flush()
            # Otherwise, start timer if not already running
            elif self.timer_task is None or self.timer_task.done():
                self.timer_task = asyncio.create_task(self._flush_after_delay())

    async def _flush_after_delay(self):
        """Flush batch after delay"""
        await asyncio.sleep(self.interval_ms / 1000)
        await self._flush()

    async def _flush(self):
        """Flush queued messages"""
        async with self.lock:
            if not self.queue:
                return

            messages = list(self.queue)
            self.queue.clear()

            if len(messages) == 1:
                # Single message - send directly (no batch overhead)
                event, data, namespace = messages[0]
                await sio.emit(event, data, namespace=namespace)
            else:
                # Multiple messages - send as batch
                batch_data = {
                    'batch': True,
                    'messages': [
                        {'e': event, 'd': data} for event, data, _ in messages
                    ]
                }
                # Use first message's namespace (assumes same namespace for batch)
                namespace = messages[0][2]
                await sio.emit('message_batch', batch_data, namespace=namespace)

                logger.debug(f"Flushed batch of {len(messages)} messages")


class ConnectionManager:
    """Manages WebSocket connections and broadcasting"""

    def __init__(self):
        self.active_connections: Dict[str, str] = {}  # sid -> user_id
        self.optimizer = PayloadOptimizer()
        self.batcher = MessageBatcher()
        self.stats = {
            'total_messages': 0,
            'total_bytes_original': 0,
            'total_bytes_optimized': 0,
            'compressed_messages': 0
        }

    async def connect(self, sid: str, user_id: str = "local-dev-user"):
        """Register new connection"""
        self.active_connections[sid] = user_id
        connected_clients.add(sid)
        logger.info(f"Client connected: {sid} (User: {user_id})")

    async def disconnect(self, sid: str):
        """Remove connection"""
        if sid in self.active_connections:
            user_id = self.active_connections.pop(sid)
            connected_clients.discard(sid)
            logger.info(f"Client disconnected: {sid} (User: {user_id})")

    async def broadcast(self, event: str, data: Dict, optimize: bool = True, batch: bool = False):
        """
        Broadcast message to all connected clients with optional optimization.

        Args:
            event: Event name
            data: Event payload
            optimize: Whether to optimize payload (default True)
            batch: Whether to batch this message (default False for important events)
        """
        # Track statistics
        self.stats['total_messages'] += 1

        if optimize:
            # Optimize payload
            optimized_data, original_size, optimized_size = self.optimizer.optimize(data)

            # Update stats
            self.stats['total_bytes_original'] += original_size
            self.stats['total_bytes_optimized'] += optimized_size

            if isinstance(optimized_data, bytes):
                self.stats['compressed_messages'] += 1
                # Add compression flag to event name
                event = f"{event}:gz"

            # Log payload sizes for monitoring (NFR requirement)
            if original_size > 1024:  # Log if > 1KB
                reduction = (1 - optimized_size / original_size) * 100
                logger.info(
                    f"Payload {event}: {original_size}B -> {optimized_size}B "
                    f"({reduction:.1f}% reduction)"
                )

            data = optimized_data
        else:
            original_size = len(json.dumps(data).encode('utf-8'))
            optimized_size = original_size
            self.stats['total_bytes_original'] += original_size
            self.stats['total_bytes_optimized'] += optimized_size

        # Batch small, non-critical messages
        if batch and optimized_size < 2048:  # Batch messages < 2KB
            await self.batcher.add_message(event, data, namespace='/')
            await self.batcher.add_message(event, data, namespace='/ws')
        else:
            # Send immediately for large or critical messages
            await sio.emit(event, data, namespace='/')
            await sio.emit(event, data, namespace='/ws')

    async def send_to_user(self, user_id: str, event: str, data: Dict, optimize: bool = True):
        """Send message to specific user"""
        if optimize:
            data, _, _ = self.optimizer.optimize(data)

        for sid, uid in self.active_connections.items():
            if uid == user_id:
                await sio.emit(event, data, room=sid)

    def get_stats(self) -> Dict[str, Any]:
        """Get performance statistics"""
        if self.stats['total_bytes_original'] > 0:
            reduction = (1 - self.stats['total_bytes_optimized'] / self.stats['total_bytes_original']) * 100
        else:
            reduction = 0

        return {
            'total_messages': self.stats['total_messages'],
            'total_bytes_original': self.stats['total_bytes_original'],
            'total_bytes_optimized': self.stats['total_bytes_optimized'],
            'reduction_percentage': round(reduction, 2),
            'compressed_messages': self.stats['compressed_messages'],
            'avg_message_size': round(
                self.stats['total_bytes_optimized'] / max(self.stats['total_messages'], 1)
            )
        }


# Global connection manager instance
manager = ConnectionManager()


# ============================================
# Socket.IO Event Handlers
# ============================================

@sio.event
async def connect(sid, environ):
    """Handle client connection"""
    logger.info(f"New connection: {sid}")
    await manager.connect(sid)

    # Send welcome message (optimized)
    await sio.emit('connection_established', {
        'sid': sid,
        'message': 'Connected to RezNet AI',
        'version': '2.0',  # New version with optimized payloads
        'features': {
            'optimized_payloads': True,
            'compression': True,
            'batching': True
        }
    }, room=sid)


@sio.event
async def disconnect(sid):
    """Handle client disconnection"""
    logger.info(f"Client disconnected: {sid}")
    await manager.disconnect(sid)


async def _handle_message_send(sid, data, namespace='/'):
    """
    Shared message handling logic for all namespaces
    Expected data: {
        'channel_id': str,
        'content': str,
        'author_name': str (optional)
    }
    """
    try:
        from core.database import SessionLocal
        from models.database import Message, Channel
        from models.schemas import WSMessageType
        from uuid import UUID
        import datetime

        logger.info(f"Message received from {sid}: {data}")

        # Create message in database
        db = SessionLocal()
        try:
            message = Message(
                channel_id=UUID(data['channel_id']),
                author_id=None,  # No auth for local MVP
                author_type='user',
                author_name=data.get('author_name', 'Developer'),
                content=data['content'],
                msg_metadata={}
            )
            db.add(message)
            db.commit()
            db.refresh(message)

            # Broadcast new message to all clients (optimized payload)
            message_data = {
                'id': str(message.id),
                'channel_id': str(message.channel_id),
                'author_type': message.author_type,
                'author_name': message.author_name,
                'content': message.content,
                'created_at': message.created_at.isoformat(),
                'metadata': message.msg_metadata
            }

            # Use optimized broadcast with batching
            await manager.broadcast('message_new', message_data, optimize=True, batch=False)

            # Check if message mentions any agents
            # For DM channels, auto-invoke the agent without requiring @mention
            from models.database import Agent
            channel = db.query(Channel).filter(Channel.id == message.channel_id).first()
            mentioned_agents = []

            if channel and channel.channel_type == "dm" and channel.dm_agent_id:
                # DM channel - auto-invoke the associated agent
                dm_agent = db.query(Agent).filter(Agent.id == channel.dm_agent_id).first()
                if dm_agent and dm_agent.is_active:
                    # Extract agent name without @ prefix for processor
                    agent_name = dm_agent.name.replace('@', '')
                    mentioned_agents.append(agent_name)
                    logger.info(f"Auto-invoking agent from DM channel: {dm_agent.name} (id: {dm_agent.id})")
            else:
                # Regular channel - check for explicit @mentions in content
                content_lower = data['content'].lower()

                if '@backend' in content_lower:
                    mentioned_agents.append('backend')
                if '@frontend' in content_lower:
                    mentioned_agents.append('frontend')
                if '@qa' in content_lower:
                    mentioned_agents.append('qa')
                if '@devops' in content_lower:
                    mentioned_agents.append('devops')
                if '@orchestrator' in content_lower or (not mentioned_agents and len(content_lower) > 10):
                    mentioned_agents.append('orchestrator')

            # Process agent responses asynchronously
            if mentioned_agents:
                from agents.processor import process_agent_message
                import asyncio

                # Run agent processing in background
                asyncio.create_task(
                    process_agent_message(
                        message_id=message.id,
                        content=data['content'],
                        channel_id=message.channel_id,
                        mentioned_agents=mentioned_agents,
                        manager=manager
                    )
                )

        finally:
            db.close()

    except Exception as e:
        logger.error(f"Error handling message: {e}")
        await sio.emit('error', {
            'message': f'Error processing message: {str(e)}'
        }, room=sid, namespace=namespace)


@sio.event
async def message_send(sid, data):
    """Handle incoming message from client on default namespace"""
    await _handle_message_send(sid, data, namespace='/')


@sio.event
async def agent_invoke(sid, data):
    """
    Directly invoke a specific agent
    Expected data: {
        'agent_name': str,
        'message': str,
        'channel_id': str,
        'context': dict (optional)
    }
    """
    try:
        logger.info(f"Agent invocation from {sid}: {data}")

        # Send thinking status (optimized)
        await manager.broadcast('agent_status', {
            'agent_name': data['agent_name'],
            'status': 'thinking'
        }, optimize=True, batch=True)

        # Process agent invocation
        from agents.processor import invoke_agent

        response = await invoke_agent(
            agent_name=data['agent_name'],
            message=data['message'],
            context=data.get('context', {}),
            channel_id=data.get('channel_id')
        )

        # Send agent response (optimized)
        await manager.broadcast('message_new', response, optimize=True, batch=False)

        # Update agent status back to online (optimized, can batch)
        await manager.broadcast('agent_status', {
            'agent_name': data['agent_name'],
            'status': 'online'
        }, optimize=True, batch=True)

    except Exception as e:
        logger.error(f"Error invoking agent: {e}")
        await sio.emit('error', {
            'message': f'Error invoking agent: {str(e)}'
        }, room=sid)


@sio.event
async def typing_start(sid, data):
    """Handle typing indicator"""
    await manager.broadcast('user_typing', {
        'channel_id': data.get('channel_id'),
        'user_name': data.get('user_name', 'Developer')
    }, optimize=True, batch=True)


@sio.event
async def ping(sid, data):
    """Handle ping for connection keepalive"""
    await sio.emit('pong', {'timestamp': data.get('timestamp')}, room=sid)


@sio.event
async def get_stats(sid, data):
    """Get WebSocket performance statistics"""
    stats = manager.get_stats()
    await sio.emit('stats_response', stats, room=sid)


# Also register handlers on /ws namespace for compatibility
# Some clients might try to connect to this namespace
@sio.on('connect', namespace='/ws')
async def ws_connect(sid, environ):
    """Handle client connection on /ws namespace"""
    logger.info(f"New connection on /ws: {sid}")
    await manager.connect(sid)
    await sio.emit('connection_established', {
        'sid': sid,
        'message': 'Connected to RezNet AI',
        'version': '2.0',
        'features': {
            'optimized_payloads': True,
            'compression': True,
            'batching': True
        }
    }, room=sid, namespace='/ws')

@sio.on('disconnect', namespace='/ws')
async def ws_disconnect(sid):
    """Handle client disconnection on /ws namespace"""
    logger.info(f"Client disconnected on /ws: {sid}")
    await manager.disconnect(sid)

@sio.on('message_send', namespace='/ws')
async def ws_message_send(sid, data):
    """Handle incoming message from client on /ws namespace"""
    await _handle_message_send(sid, data, namespace='/ws')
