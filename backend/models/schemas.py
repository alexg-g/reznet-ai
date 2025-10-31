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
    channel_type: str = "public"  # 'public', 'dm', 'private'
    dm_agent_id: Optional[UUID] = None


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
    msg_metadata: Dict[str, Any] = Field(default={}, serialization_alias='metadata')
    created_at: datetime

    class Config:
        from_attributes = True
        populate_by_name = True


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
# Workflow Schemas
# ============================================

class WorkflowTaskBase(BaseModel):
    description: str = Field(..., min_length=1)
    agent_id: UUID
    order_index: int = Field(..., ge=0)
    depends_on: List[UUID] = []


class WorkflowTaskCreate(WorkflowTaskBase):
    pass


class WorkflowTaskResponse(WorkflowTaskBase):
    id: UUID
    workflow_id: UUID
    task_id: Optional[UUID]
    status: str  # pending, ready, in_progress, completed, failed, skipped
    output: Optional[Dict[str, Any]]
    error: Optional[str]
    task_metadata: Dict[str, Any] = {}
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True


class WorkflowBase(BaseModel):
    description: str = Field(..., min_length=1)


class WorkflowCreate(WorkflowBase):
    orchestrator_id: UUID
    channel_id: UUID


class WorkflowPlanRequest(BaseModel):
    """Request for orchestrator to create a workflow plan"""
    user_request: str = Field(..., min_length=1)
    channel_id: UUID
    context: Dict[str, Any] = {}


class WorkflowResponse(WorkflowBase):
    id: UUID
    orchestrator_id: UUID
    channel_id: UUID
    status: str  # planning, executing, completed, failed, cancelled
    plan: Optional[Dict[str, Any]]
    results: Optional[Dict[str, Any]]
    error: Optional[str]
    workflow_metadata: Dict[str, Any] = {}
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    workflow_tasks: List[WorkflowTaskResponse] = []

    class Config:
        from_attributes = True


class WorkflowProgressUpdate(BaseModel):
    """Real-time workflow progress update"""
    workflow_id: UUID
    completed_tasks: int
    total_tasks: int
    percent_complete: float
    current_task: Optional[str] = None


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

    # Workflow events
    WORKFLOW_CREATED = "workflow:created"
    WORKFLOW_PLANNING = "workflow:planning"
    WORKFLOW_PLAN_READY = "workflow:plan_ready"
    WORKFLOW_STARTED = "workflow:started"
    WORKFLOW_PROGRESS = "workflow:progress"
    WORKFLOW_TASK_STARTED = "workflow:task_started"
    WORKFLOW_TASK_COMPLETED = "workflow:task_completed"
    WORKFLOW_TASK_FAILED = "workflow:task_failed"
    WORKFLOW_COMPLETED = "workflow:completed"
    WORKFLOW_FAILED = "workflow:failed"
    WORKFLOW_CANCELLED = "workflow:cancelled"


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


# ============================================
# File Upload Schemas
# ============================================

class UploadedFileBase(BaseModel):
    """Base schema for uploaded files"""
    original_filename: str
    workspace_path: str
    file_size: int
    mime_type: Optional[str] = None


class UploadedFileCreate(UploadedFileBase):
    """Schema for creating uploaded file record"""
    stored_filename: str
    message_id: Optional[UUID] = None
    uploaded_by: str = "local-user"


class UploadedFileResponse(UploadedFileBase):
    """Schema for uploaded file response"""
    id: UUID
    stored_filename: str
    message_id: Optional[UUID] = None
    uploaded_by: str
    created_at: datetime

    class Config:
        from_attributes = True


class FileUploadResponse(BaseModel):
    """Response for file upload API"""
    success: bool
    file: UploadedFileResponse
    workspace_path: str
    message: str
