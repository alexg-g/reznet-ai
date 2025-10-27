"""
Agent endpoints
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID

from core.database import get_db
from models.database import Agent, Channel
from models.schemas import AgentResponse, AgentInvokeRequest, AgentInvokeResponse, ChannelResponse

router = APIRouter()


@router.get("/agents", response_model=List[AgentResponse])
async def list_agents(
    active_only: bool = True,
    db: Session = Depends(get_db)
):
    """Get all agents"""
    query = db.query(Agent)
    if active_only:
        query = query.filter(Agent.is_active == True)

    agents = query.order_by(Agent.created_at).all()
    return agents


@router.get("/agents/{agent_id}", response_model=AgentResponse)
async def get_agent(agent_id: UUID, db: Session = Depends(get_db)):
    """Get agent by ID"""
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.get("/agents/name/{agent_name}", response_model=AgentResponse)
async def get_agent_by_name(agent_name: str, db: Session = Depends(get_db)):
    """Get agent by name"""
    # Add @ prefix if not present
    if not agent_name.startswith('@'):
        agent_name = f'@{agent_name}'

    agent = db.query(Agent).filter(Agent.name == agent_name).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.post("/agents/{agent_id}/invoke", response_model=AgentInvokeResponse)
async def invoke_agent(
    agent_id: UUID,
    request: AgentInvokeRequest,
    db: Session = Depends(get_db)
):
    """Directly invoke an agent with a message"""
    from agents.processor import invoke_agent_by_id

    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    if not agent.is_active:
        raise HTTPException(status_code=400, detail="Agent is not active")

    # Process agent invocation
    response = await invoke_agent_by_id(
        agent_id=agent_id,
        message=request.message,
        context=request.context,
        channel_id=request.channel_id
    )

    return response


@router.get("/agents/{agent_id}/status")
async def get_agent_status(agent_id: UUID, db: Session = Depends(get_db)):
    """Get current status of an agent"""
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # In a real implementation, this would check the agent's current state
    # For now, return basic status
    return {
        "agent_id": str(agent.id),
        "agent_name": agent.name,
        "status": "online" if agent.is_active else "offline",
        "agent_type": agent.agent_type
    }


@router.patch("/agents/{agent_id}/activate")
async def activate_agent(agent_id: UUID, db: Session = Depends(get_db)):
    """Activate an agent"""
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    agent.is_active = True
    db.commit()
    return {"message": f"Agent {agent.name} activated"}


@router.patch("/agents/{agent_id}/deactivate")
async def deactivate_agent(agent_id: UUID, db: Session = Depends(get_db)):
    """Deactivate an agent"""
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    agent.is_active = False
    db.commit()
    return {"message": f"Agent {agent.name} deactivated"}


@router.get("/agents/{agent_id}/dm-channel", response_model=ChannelResponse)
async def get_agent_dm_channel(agent_id: UUID, db: Session = Depends(get_db)):
    """
    Get the DM channel for an agent (creates if doesn't exist)

    Returns the dedicated DM channel for 1-on-1 conversations with this agent.
    Channel name pattern: dm-{agent_name}
    """
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # DM channel naming: dm-{agent_name}
    dm_channel_name = f"dm-{agent.name}"

    # Find or create DM channel
    dm_channel = db.query(Channel).filter(Channel.name == dm_channel_name).first()

    if not dm_channel:
        # Create DM channel if it doesn't exist
        dm_channel = Channel(
            name=dm_channel_name,
            topic=f"Direct message with {agent.name}",
            is_archived=False
        )
        db.add(dm_channel)
        db.commit()
        db.refresh(dm_channel)

    return dm_channel


@router.get("/agents/{agent_id}/system-prompt")
async def get_agent_system_prompt(agent_id: UUID, db: Session = Depends(get_db)):
    """
    Get the full assembled system prompt for an agent

    Returns the complete system prompt including persona, tool instructions,
    and all system additions that the agent uses for LLM interactions.
    """
    from agents.processor import get_agent_by_id

    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Get agent instance to access system prompt
    agent_instance = await get_agent_by_id(agent_id)

    if not agent_instance:
        raise HTTPException(status_code=500, detail="Failed to instantiate agent")

    # Get full system prompt
    system_prompt = agent_instance.get_full_system_prompt()

    return {
        "agent_id": str(agent_id),
        "agent_name": agent.name,
        "agent_type": agent.agent_type,
        "system_prompt": system_prompt,
        "provider": agent_instance.llm.provider,
        "model": agent_instance.llm.model,
        "tools_enabled": agent_instance.enable_tools
    }
