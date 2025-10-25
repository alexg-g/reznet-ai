"""
WebSocket Manager using Socket.IO
Handles real-time communication between frontend and backend
"""

import socketio
from typing import Dict, Set
import logging
from uuid import UUID
import json

# Create Socket.IO server
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*',  # For local development
    logger=True,
    engineio_logger=False
)

# Create ASGI app
socket_app = socketio.ASGIApp(sio)

# Track connected clients
connected_clients: Set[str] = set()

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections and broadcasting"""

    def __init__(self):
        self.active_connections: Dict[str, str] = {}  # sid -> user_id

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

    async def broadcast(self, event: str, data: Dict):
        """Broadcast message to all connected clients on all namespaces"""
        await sio.emit(event, data, namespace='/')
        await sio.emit(event, data, namespace='/ws')

    async def send_to_user(self, user_id: str, event: str, data: Dict):
        """Send message to specific user"""
        for sid, uid in self.active_connections.items():
            if uid == user_id:
                await sio.emit(event, data, room=sid)


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

    # Send welcome message
    await sio.emit('connection_established', {
        'sid': sid,
        'message': 'Connected to RezNet AI'
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
        from models.database import Message
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

            # Broadcast new message to all clients (on all namespaces)
            message_data = {
                'id': str(message.id),
                'channel_id': str(message.channel_id),
                'author_type': message.author_type,
                'author_name': message.author_name,
                'content': message.content,
                'created_at': message.created_at.isoformat(),
                'metadata': message.msg_metadata
            }

            # Broadcast to default namespace
            await sio.emit('message_new', message_data, namespace='/')
            # Broadcast to /ws namespace
            await sio.emit('message_new', message_data, namespace='/ws')

            # Check if message mentions any agents
            content_lower = data['content'].lower()
            mentioned_agents = []

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

        # Send thinking status
        await sio.emit('agent_status', {
            'agent_name': data['agent_name'],
            'status': 'thinking'
        }, room=sid)

        # Process agent invocation
        from agents.processor import invoke_agent

        response = await invoke_agent(
            agent_name=data['agent_name'],
            message=data['message'],
            context=data.get('context', {}),
            channel_id=data.get('channel_id')
        )

        # Send agent response
        await manager.broadcast('message_new', response)

        # Update agent status back to online
        await sio.emit('agent_status', {
            'agent_name': data['agent_name'],
            'status': 'online'
        })

    except Exception as e:
        logger.error(f"Error invoking agent: {e}")
        await sio.emit('error', {
            'message': f'Error invoking agent: {str(e)}'
        }, room=sid)


@sio.event
async def typing_start(sid, data):
    """Handle typing indicator"""
    await sio.emit('user_typing', {
        'channel_id': data.get('channel_id'),
        'user_name': data.get('user_name', 'Developer')
    }, skip_sid=sid)


@sio.event
async def ping(sid, data):
    """Handle ping for connection keepalive"""
    await sio.emit('pong', {'timestamp': data.get('timestamp')}, room=sid)


# Also register handlers on /ws namespace for compatibility
# Some clients might try to connect to this namespace
@sio.on('connect', namespace='/ws')
async def ws_connect(sid, environ):
    """Handle client connection on /ws namespace"""
    logger.info(f"New connection on /ws: {sid}")
    await manager.connect(sid)
    await sio.emit('connection_established', {
        'sid': sid,
        'message': 'Connected to RezNet AI'
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
