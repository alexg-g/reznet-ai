"""
Memory Management API Endpoints

Provides REST API for agent semantic memory operations.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from uuid import UUID
from typing import List, Optional, Dict, Any
import logging

from core.database import get_db
from models.database import Agent, AgentMemory
from agents.specialists import (
    BackendAgent,
    FrontendAgent,
    QAAgent,
    DevOpsAgent,
    OrchestratorAgent
)
from agents.custom_agent import CustomAgent
from agents.memory_manager import SemanticMemoryManager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agents", tags=["memories"])

AGENT_CLASSES = {
    "backend": BackendAgent,
    "frontend": FrontendAgent,
    "qa": QAAgent,
    "devops": DevOpsAgent,
    "orchestrator": OrchestratorAgent
}


def get_agent_with_memory(agent_id: UUID, db: Session) -> Any:
    """
    Get agent instance with memory support

    Supports both built-in specialist agents and custom user-created agents.
    All agents automatically get full semantic memory support.

    Args:
        agent_id: Agent UUID
        db: Database session

    Returns:
        Agent instance with memory

    Raises:
        HTTPException: If agent not found
    """
    agent_record = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent_record:
        raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}")

    # Try to get specialist agent class
    agent_class = AGENT_CLASSES.get(agent_record.agent_type)

    # If not a known specialist, use CustomAgent (for user-created agents)
    if not agent_class:
        logger.info(
            f"Using CustomAgent for memory operations on agent type '{agent_record.agent_type}' "
            f"(agent: {agent_record.name})"
        )
        agent_class = CustomAgent

    # Instantiate agent with DB session for memory
    agent = agent_class(
        agent_id=agent_record.id,
        name=agent_record.name,
        agent_type=agent_record.agent_type,
        persona=agent_record.persona,
        config=agent_record.config,
        db=db
    )

    return agent


@router.get("/{agent_id}/memory/stats")
async def get_memory_stats(
    agent_id: UUID,
    channel_id: Optional[UUID] = Query(None, description="Filter by channel"),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Get agent memory statistics

    Returns memory count by type, average importance, etc.
    """
    try:
        agent = get_agent_with_memory(agent_id, db)

        # Check if agent has memory support
        if not hasattr(agent, 'get_memory_stats'):
            return {
                "enabled": False,
                "message": f"Agent {agent.name} does not have memory support enabled"
            }

        stats = agent.get_memory_stats(channel_id=channel_id)
        stats["enabled"] = True
        stats["agent_name"] = agent.name

        return stats

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting memory stats for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{agent_id}/memory/search")
async def search_memories(
    agent_id: UUID,
    query: str = Query(..., description="Search query"),
    limit: int = Query(5, ge=1, le=50, description="Max results to return"),
    memory_types: Optional[List[str]] = Query(None, description="Filter by memory types"),
    channel_id: Optional[UUID] = Query(None, description="Filter by channel"),
    min_importance: int = Query(3, ge=1, le=10, description="Minimum importance score"),
    db: Session = Depends(get_db)
) -> List[Dict[str, Any]]:
    """
    Search agent memories semantically

    Performs vector similarity search to find relevant past context.
    """
    try:
        agent_record = db.query(Agent).filter(Agent.id == agent_id).first()
        if not agent_record:
            raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}")

        # Get memory manager
        memory_manager = SemanticMemoryManager(
            agent_id=agent_id,
            db=db
        )

        # Retrieve relevant memories
        memories = await memory_manager.retrieve_relevant(
            query=query,
            limit=limit,
            memory_types=memory_types,
            channel_id=channel_id,
            min_importance=min_importance
        )

        return memories

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error searching memories for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{agent_id}/memory/summarize")
async def create_summary(
    agent_id: UUID,
    channel_id: Optional[UUID] = Query(None, description="Channel to summarize"),
    memory_count: int = Query(20, ge=5, le=100, description="Number of memories to summarize"),
    db: Session = Depends(get_db)
) -> Dict[str, str]:
    """
    Create a summary of agent's recent memories

    Uses LLM to condense recent context into a concise summary.
    """
    try:
        agent = get_agent_with_memory(agent_id, db)

        # Check if agent has memory support
        if not hasattr(agent, 'create_memory_summary'):
            raise HTTPException(
                status_code=400,
                detail=f"Agent {agent.name} does not have memory support enabled"
            )

        summary = await agent.create_memory_summary(channel_id=channel_id)

        return {
            "agent_name": agent.name,
            "channel_id": str(channel_id) if channel_id else None,
            "summary": summary
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating summary for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{agent_id}/memory/cleanup")
async def cleanup_memories(
    agent_id: UUID,
    days_old: int = Query(30, ge=1, le=365, description="Delete memories older than this"),
    keep_important: bool = Query(True, description="Keep important memories regardless of age"),
    min_importance_to_keep: int = Query(7, ge=1, le=10, description="Minimum importance to keep"),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Clean up old, low-importance memories

    Helps manage database size by removing stale memories.
    """
    try:
        agent = get_agent_with_memory(agent_id, db)

        # Check if agent has memory support
        if not hasattr(agent, 'clear_old_memories'):
            raise HTTPException(
                status_code=400,
                detail=f"Agent {agent.name} does not have memory support enabled"
            )

        deleted_count = await agent.clear_old_memories(
            days_old=days_old,
            keep_important=keep_important,
            min_importance_to_keep=min_importance_to_keep
        )

        return {
            "agent_name": agent.name,
            "deleted_count": deleted_count,
            "days_old": days_old,
            "kept_important": keep_important
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cleaning up memories for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{agent_id}/memory/recent")
async def get_recent_memories(
    agent_id: UUID,
    limit: int = Query(10, ge=1, le=100, description="Number of recent memories"),
    channel_id: Optional[UUID] = Query(None, description="Filter by channel"),
    db: Session = Depends(get_db)
) -> List[Dict[str, Any]]:
    """
    Get most recent memories for an agent

    Returns memories in chronological order.
    """
    try:
        agent_record = db.query(Agent).filter(Agent.id == agent_id).first()
        if not agent_record:
            raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}")

        # Get memory manager
        memory_manager = SemanticMemoryManager(
            agent_id=agent_id,
            db=db
        )

        memories = await memory_manager.get_recent_memories(
            limit=limit,
            channel_id=channel_id
        )

        return memories

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting recent memories for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/memory/health")
async def memory_system_health(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Check semantic memory system health

    Verifies pgvector extension and database connectivity.
    """
    try:
        from sqlalchemy import text

        # Check pgvector extension
        result = db.execute(text(
            "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector')"
        ))
        has_pgvector = result.scalar()

        # Count total memories
        total_memories = db.query(AgentMemory).count()

        # Count by type
        from sqlalchemy import func
        type_counts = db.query(
            AgentMemory.memory_type,
            func.count(AgentMemory.id)
        ).group_by(AgentMemory.memory_type).all()

        return {
            "status": "healthy" if has_pgvector else "degraded",
            "pgvector_enabled": has_pgvector,
            "total_memories": total_memories,
            "memory_types": {memory_type: count for memory_type, count in type_counts},
            "message": "Semantic memory system operational" if has_pgvector else "pgvector extension not enabled"
        }

    except Exception as e:
        logger.error(f"Error checking memory system health: {e}")
        return {
            "status": "unhealthy",
            "error": str(e),
            "message": "Failed to check memory system health"
        }
