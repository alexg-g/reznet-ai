"""
Agent message processing and orchestration
"""

from typing import Dict, Any, List, Optional
from uuid import UUID
import logging
from sqlalchemy.orm import Session

from core.database import SessionLocal
from models.database import Agent, Message
from agents.specialists import (
    BackendAgent,
    FrontendAgent,
    QAAgent,
    DevOpsAgent,
    OrchestratorAgent
)

logger = logging.getLogger(__name__)

# Agent registry
AGENT_CLASSES = {
    "backend": BackendAgent,
    "frontend": FrontendAgent,
    "qa": QAAgent,
    "devops": DevOpsAgent,
    "orchestrator": OrchestratorAgent
}

# Cache for instantiated agents
_agent_cache: Dict[UUID, Any] = {}


def get_agent_instance(agent_record: Agent) -> Any:
    """
    Get or create agent instance from database record
    """
    if agent_record.id in _agent_cache:
        return _agent_cache[agent_record.id]

    agent_class = AGENT_CLASSES.get(agent_record.agent_type)
    if not agent_class:
        logger.error(f"Unknown agent type: {agent_record.agent_type}")
        return None

    # Create agent instance
    agent = agent_class(
        agent_id=agent_record.id,
        name=agent_record.name,
        agent_type=agent_record.agent_type,
        persona=agent_record.persona,
        config=agent_record.config
    )

    _agent_cache[agent_record.id] = agent
    return agent


async def process_agent_message(
    message_id: UUID,
    content: str,
    channel_id: UUID,
    mentioned_agents: List[str],
    manager: Any  # WebSocket manager
):
    """
    Process a message that mentions one or more agents
    """
    db = SessionLocal()
    try:
        # Get conversation context
        recent_messages = (
            db.query(Message)
            .filter(Message.channel_id == channel_id)
            .order_by(Message.created_at.desc())
            .limit(10)
            .all()
        )

        context = {
            "conversation_history": [
                {
                    "author": msg.author_name,
                    "content": msg.content,
                    "type": msg.author_type
                }
                for msg in reversed(recent_messages)
            ]
        }

        # Process each mentioned agent
        for agent_name in mentioned_agents:
            # Get agent from database
            agent_record = db.query(Agent).filter(
                Agent.name == f"@{agent_name}"
            ).first()

            if not agent_record or not agent_record.is_active:
                logger.warning(f"Agent not found or inactive: @{agent_name}")
                continue

            # Send "thinking" status
            await manager.broadcast('agent_status', {
                'agent_name': f"@{agent_name}",
                'status': 'thinking'
            })

            try:
                # Get agent instance
                agent = get_agent_instance(agent_record)
                if not agent:
                    continue

                # Process message
                response = await agent.process_message(content, context)

                # Save agent's response to database
                agent_message = Message(
                    channel_id=channel_id,
                    author_id=agent_record.id,
                    author_type='agent',
                    author_name=agent_record.name,
                    content=response,
                    metadata={
                        'model': agent.llm.model,
                        'provider': agent.llm.provider,
                        'in_reply_to': str(message_id)
                    }
                )
                db.add(agent_message)
                db.commit()
                db.refresh(agent_message)

                # Broadcast agent response
                await manager.broadcast('message_new', {
                    'id': str(agent_message.id),
                    'channel_id': str(agent_message.channel_id),
                    'author_type': agent_message.author_type,
                    'author_name': agent_message.author_name,
                    'content': agent_message.content,
                    'created_at': agent_message.created_at.isoformat(),
                    'metadata': agent_message.metadata
                })

                # Update agent status back to online
                await manager.broadcast('agent_status', {
                    'agent_name': f"@{agent_name}",
                    'status': 'online'
                })

            except Exception as e:
                logger.error(f"Error processing agent {agent_name}: {e}")

                # Send error message
                error_message = Message(
                    channel_id=channel_id,
                    author_id=agent_record.id,
                    author_type='agent',
                    author_name=agent_record.name,
                    content=f"I encountered an error: {str(e)}",
                    metadata={'error': str(e), 'in_reply_to': str(message_id)}
                )
                db.add(error_message)
                db.commit()
                db.refresh(error_message)

                await manager.broadcast('message_new', {
                    'id': str(error_message.id),
                    'channel_id': str(error_message.channel_id),
                    'author_type': error_message.author_type,
                    'author_name': error_message.author_name,
                    'content': error_message.content,
                    'created_at': error_message.created_at.isoformat(),
                    'metadata': error_message.metadata
                })

                # Update status to online
                await manager.broadcast('agent_status', {
                    'agent_name': f"@{agent_name}",
                    'status': 'online'
                })

    finally:
        db.close()


async def invoke_agent(
    agent_name: str,
    message: str,
    context: Dict[str, Any] = None,
    channel_id: Optional[UUID] = None
) -> Dict[str, Any]:
    """
    Directly invoke an agent by name
    """
    db = SessionLocal()
    try:
        # Add @ prefix if not present
        if not agent_name.startswith('@'):
            agent_name = f'@{agent_name}'

        # Get agent from database
        agent_record = db.query(Agent).filter(Agent.name == agent_name).first()
        if not agent_record:
            raise ValueError(f"Agent not found: {agent_name}")

        if not agent_record.is_active:
            raise ValueError(f"Agent is not active: {agent_name}")

        # Get agent instance
        agent = get_agent_instance(agent_record)
        if not agent:
            raise ValueError(f"Could not instantiate agent: {agent_name}")

        # Process message
        response = await agent.process_message(message, context or {})

        # Save to database if channel provided
        if channel_id:
            agent_message = Message(
                channel_id=channel_id,
                author_id=agent_record.id,
                author_type='agent',
                author_name=agent_record.name,
                content=response,
                metadata={
                    'model': agent.llm.model,
                    'provider': agent.llm.provider
                }
            )
            db.add(agent_message)
            db.commit()
            db.refresh(agent_message)

            return {
                'id': str(agent_message.id),
                'channel_id': str(agent_message.channel_id),
                'author_type': agent_message.author_type,
                'author_name': agent_message.author_name,
                'content': agent_message.content,
                'created_at': agent_message.created_at.isoformat(),
                'metadata': agent_message.metadata
            }

        return {
            'agent_name': agent_name,
            'response': response,
            'metadata': {
                'model': agent.llm.model,
                'provider': agent.llm.provider
            }
        }

    finally:
        db.close()


async def invoke_agent_by_id(
    agent_id: UUID,
    message: str,
    context: Dict[str, Any] = None,
    channel_id: Optional[UUID] = None
) -> Dict[str, Any]:
    """
    Directly invoke an agent by ID
    """
    db = SessionLocal()
    try:
        # Get agent from database
        agent_record = db.query(Agent).filter(Agent.id == agent_id).first()
        if not agent_record:
            raise ValueError(f"Agent not found with ID: {agent_id}")

        return await invoke_agent(agent_record.name, message, context, channel_id)

    finally:
        db.close()
