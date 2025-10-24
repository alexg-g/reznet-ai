"""
Pydantic schemas for API request/response validation
"""

from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime
from uuid import UUID


# ============================================
# Channel Schemas
# ============================================

class ChannelBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    topic: Optional[str] = None


class ChannelCreate(ChannelBase):
    pass


class ChannelResponse(ChannelBase):
    id: UUID
    is_archived: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============================================
# Message Schemas
# ============================================

class MessageBase(BaseModel):
    content: str = Field(..., min_length=1)
    thread_id: Optional[UUID] = None


class MessageCreate(MessageBase):
    channel_id: UUID
    author_type: str = "user"
    author_name: Optional[str] = "Developer"


class MessageResponse(BaseModel):
    id: UUID
    channel_id: UUID
    author_id: Optional[UUID]
    author_type: str
    author_name: Optional[str]
    content: str
    thread_id: Optional[UUID]
    metadata: Dict[str, Any] = {}
    created_at: datetime

    class Config:
        from_attributes = True


# ============================================
# Agent Schemas
# ============================================

class AgentPersona(BaseModel):
    role: str
    goal: str
    backstory: str
    capabilities: Optional[List[str]] = []


class AgentConfig(BaseModel):
    model: str = "claude-3-5-sonnet-20241022"
    temperature: float = 0.7
    max_tokens: int = 4000


class AgentBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    agent_type: str
    persona: AgentPersona
    config: AgentConfig = AgentConfig()


class AgentCreate(AgentBase):
    pass


class AgentResponse(AgentBase):
    id: UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AgentInvokeRequest(BaseModel):
    message: str = Field(..., min_length=1)
    context: Dict[str, Any] = {}
    channel_id: Optional[UUID] = None


class AgentInvokeResponse(BaseModel):
    agent_id: UUID
    agent_name: str
    response: str
    metadata: Dict[str, Any] = {}


# ============================================
# Task Schemas
# ============================================

class TaskBase(BaseModel):
    description: str = Field(..., min_length=1)
    assigned_to: Optional[UUID] = None
    priority: str = "medium"
    context: Dict[str, Any] = {}


class TaskCreate(TaskBase):
    pass


class TaskResponse(TaskBase):
    id: UUID
    status: str
    result: Optional[Dict[str, Any]]
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True


# ============================================
# WebSocket Schemas
# ============================================

class WSMessageType:
    """WebSocket message types"""
    # Client -> Server
    MESSAGE_SEND = "message:send"
    AGENT_INVOKE = "agent:invoke"
    TYPING_START = "typing:start"

    # Server -> Client
    MESSAGE_NEW = "message:new"
    AGENT_STATUS = "agent:status"
    AGENT_THINKING = "agent:thinking"
    TASK_PROGRESS = "task:progress"
    ERROR = "error"


class WSMessage(BaseModel):
    """WebSocket message structure"""
    type: str
    data: Dict[str, Any]
    timestamp: Optional[datetime] = None


class WSAgentStatus(BaseModel):
    """Agent status update"""
    agent_id: UUID
    agent_name: str
    status: str  # 'online', 'thinking', 'working', 'offline'
    current_task: Optional[str] = None
