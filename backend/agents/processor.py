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
from utils.text_parsing import extract_mentions

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


def clear_agent_cache():
    """
    Clear the agent cache.
    This is called on application startup to ensure fresh agent instances
    with valid HTTP client connections after hot-reload.
    """
    global _agent_cache
    logger.info(f"Clearing agent cache ({len(_agent_cache)} agents)")
    _agent_cache.clear()


async def cleanup_agent_cache():
    """
    Cleanup all cached agents, closing their HTTP clients properly.
    This is called on application shutdown.
    """
    global _agent_cache
    logger.info(f"Cleaning up agent cache ({len(_agent_cache)} agents)")

    for agent_id, agent in _agent_cache.items():
        try:
            # Close httpx client if it exists (for Ollama)
            if hasattr(agent, 'llm') and hasattr(agent.llm, 'client'):
                if hasattr(agent.llm.client, 'aclose'):
                    await agent.llm.client.aclose()
                    logger.debug(f"Closed HTTP client for agent {agent.name}")
        except Exception as e:
            logger.warning(f"Error closing client for agent {agent_id}: {e}")

    _agent_cache.clear()


# ============================================
# Agent Task Queue Functions
# ============================================

def can_accept_task(agent_id: UUID, db: Session) -> bool:
    """
    Check if an agent can accept a new task (not currently busy)

    Args:
        agent_id: Agent UUID
        db: Database session

    Returns:
        True if agent is available, False if busy
    """
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        return False

    return not agent.is_busy


def mark_agent_busy(agent_id: UUID, task_id: UUID, db: Session):
    """
    Mark an agent as busy with a specific task

    Args:
        agent_id: Agent UUID
        task_id: Task/Message UUID the agent is working on
        db: Database session
    """
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if agent:
        agent.is_busy = True
        agent.current_task_id = task_id
        db.commit()
        logger.info(f"Agent {agent.name} marked as busy with task {task_id}")


def mark_agent_available(agent_id: UUID, db: Session):
    """
    Mark an agent as available (finished current task)

    Args:
        agent_id: Agent UUID
        db: Database session
    """
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if agent:
        task_id = agent.current_task_id
        agent.is_busy = False
        agent.current_task_id = None
        db.commit()
        logger.info(f"Agent {agent.name} marked as available (completed task {task_id})")


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
    manager: Any,  # WebSocket manager
    depth: int = 0,  # Recursion depth (max 3)
    call_chain: Optional[List[str]] = None  # Track agent call chain to prevent loops
):
    """
    Process a message that mentions one or more agents

    Args:
        message_id: UUID of the message that triggered this
        content: Message content
        channel_id: Channel UUID
        mentioned_agents: List of agent names (without @)
        manager: WebSocket manager for broadcasting
        depth: Current recursion depth (0 = user message, 1 = agent response, etc.)
        call_chain: List of agent names already called in this chain (loop prevention)
    """
    from models.database import Channel

    # Initialize call chain if not provided
    if call_chain is None:
        call_chain = []

    # Check recursion depth limit
    MAX_DEPTH = 3
    if depth >= MAX_DEPTH:
        logger.warning(f"Max recursion depth ({MAX_DEPTH}) reached, stopping agent chain")
        return

    db = SessionLocal()
    try:
        # Get channel to check context_cleared_at
        channel = db.query(Channel).filter(Channel.id == channel_id).first()

        # Build message query
        message_query = db.query(Message).filter(Message.channel_id == channel_id)

        # If context was cleared, only get messages after that timestamp
        if channel and channel.context_cleared_at:
            message_query = message_query.filter(Message.created_at > channel.context_cleared_at)

        # Get conversation context
        recent_messages = (
            message_query
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
            ],
            "depth": depth,
            "call_chain": call_chain
        }

        # Process each mentioned agent
        for agent_name in mentioned_agents:
            # Check if agent is already in call chain (prevent loops)
            if agent_name in call_chain:
                logger.warning(f"Agent @{agent_name} already in call chain {call_chain}, skipping to prevent loop")
                continue
            # Get agent from database
            agent_record = db.query(Agent).filter(
                Agent.name == f"@{agent_name}"
            ).first()

            if not agent_record or not agent_record.is_active:
                logger.warning(f"Agent not found or inactive: @{agent_name}")
                continue

            # Check if agent is busy
            if agent_record.is_busy:
                logger.warning(f"Agent @{agent_name} is busy with task {agent_record.current_task_id}, queueing not implemented yet")
                # TODO: Implement task queueing
                # For now, send a status message
                busy_message = Message(
                    channel_id=channel_id,
                    author_id=None,
                    author_type='system',
                    author_name='System',
                    content=f"⏳ @{agent_name} is currently busy. Please try again in a moment.",
                    msg_metadata={'busy': True, 'agent': agent_name}
                )
                db.add(busy_message)
                db.commit()
                db.refresh(busy_message)
                await manager.broadcast('message_new', {
                    'id': str(busy_message.id),
                    'channel_id': str(busy_message.channel_id),
                    'author_type': busy_message.author_type,
                    'author_name': busy_message.author_name,
                    'content': busy_message.content,
                    'created_at': busy_message.created_at.isoformat(),
                    'metadata': busy_message.msg_metadata
                })
                continue

            # Mark agent as busy
            mark_agent_busy(agent_record.id, message_id, db)

            # Send "thinking" status
            await manager.broadcast('agent_status', {
                'agent_name': f"@{agent_name}",
                'status': 'thinking'
            })

            try:
                # Special handling for orchestrator: Use workflow system for complex tasks
                if agent_record.agent_type == "orchestrator":
                    # Import here to avoid circular dependency
                    from agents.workflow_orchestrator import WorkflowOrchestrator

                    logger.info(f"Orchestrator triggered via chat, creating workflow for: {content[:100]}")

                    # Create workflow orchestrator
                    workflow_orchestrator = WorkflowOrchestrator(manager)

                    # Create workflow from user request
                    workflow = await workflow_orchestrator.create_workflow_from_request(
                        user_request=content,
                        orchestrator_id=agent_record.id,
                        channel_id=channel_id,
                        db=db
                    )

                    # Post workflow created message to channel
                    workflow_msg = Message(
                        channel_id=channel_id,
                        author_id=agent_record.id,
                        author_type='agent',
                        author_name=agent_record.name,
                        content=f"I've created a workflow to handle your request. Executing {len(workflow.workflow_tasks)} tasks...",
                        metadata={
                            'workflow_id': str(workflow.id),
                            'in_reply_to': str(message_id)
                        }
                    )
                    db.add(workflow_msg)
                    db.commit()
                    db.refresh(workflow_msg)

                    await manager.broadcast('message_new', {
                        'id': str(workflow_msg.id),
                        'channel_id': str(workflow_msg.channel_id),
                        'author_type': workflow_msg.author_type,
                        'author_name': workflow_msg.author_name,
                        'content': workflow_msg.content,
                        'created_at': workflow_msg.created_at.isoformat(),
                        'metadata': workflow_msg.msg_metadata
                    })

                    # Execute workflow (async in background with new DB session)
                    import asyncio

                    async def run_workflow():
                        """Execute workflow with its own database session"""
                        workflow_db = SessionLocal()
                        try:
                            await workflow_orchestrator.execute_workflow(workflow.id, workflow_db)
                        finally:
                            workflow_db.close()

                    asyncio.create_task(run_workflow())

                    # Mark orchestrator as available (workflow runs in background)
                    mark_agent_available(agent_record.id, db)

                    await manager.broadcast('agent_status', {
                        'agent_name': f"@{agent_name}",
                        'status': 'online'
                    })

                    # Skip regular message processing for orchestrator
                    continue

                # Regular agent processing for non-orchestrator agents
                # Get agent instance
                agent = get_agent_instance(agent_record)
                if not agent:
                    mark_agent_available(agent_record.id, db)
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
                    'metadata': agent_message.msg_metadata
                })

                # Mark agent as available
                mark_agent_available(agent_record.id, db)

                # Update agent status back to online
                await manager.broadcast('agent_status', {
                    'agent_name': f"@{agent_name}",
                    'status': 'online'
                })

                # Check agent response for @mentions (recursive triggering)
                # Extract mentions from response
                response_mentions = extract_mentions(response, strip_md=True)

                if response_mentions and depth < MAX_DEPTH - 1:
                    # Found mentions in agent response - trigger those agents recursively
                    sub_agent_names = [mention[1] for mention in response_mentions]  # Extract names without @

                    # Filter out mentions already in call chain
                    new_agents = [name for name in sub_agent_names if name not in call_chain and name != agent_name]

                    if new_agents:
                        logger.info(f"Agent @{agent_name} mentioned {new_agents}, triggering recursively (depth {depth + 1})")

                        # Update call chain for sub-agents
                        updated_chain = call_chain + [agent_name]

                        # Recursively process sub-agent mentions
                        import asyncio
                        asyncio.create_task(
                            process_agent_message(
                                message_id=agent_message.id,  # Use agent's message as trigger
                                content=response,
                                channel_id=channel_id,
                                mentioned_agents=new_agents,
                                manager=manager,
                                depth=depth + 1,
                                call_chain=updated_chain
                            )
                        )

            except Exception as e:
                logger.error(f"Error processing agent {agent_name}: {e}")

                # Mark agent as available (release from busy state)
                mark_agent_available(agent_record.id, db)

                # Send error message
                error_message = Message(
                    channel_id=channel_id,
                    author_id=agent_record.id,
                    author_type='agent',
                    author_name=agent_record.name,
                    content=f"I encountered an error: {str(e)}",
                    msg_metadata={'error': str(e), 'in_reply_to': str(message_id)}
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
                    'metadata': error_message.msg_metadata
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
                'metadata': agent_message.msg_metadata
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
