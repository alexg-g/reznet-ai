"""
SQLAlchemy Database Models
"""

from sqlalchemy import Column, String, Boolean, Text, DateTime, ForeignKey, Integer, JSON, func, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from datetime import datetime
from pgvector.sqlalchemy import Vector
import uuid

from core.database import Base


class Workspace(Base):
    """Workspace model"""
    __tablename__ = "workspace"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), default="Local Workspace")
    settings = Column(JSONB, default={})
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Agent(Base):
    """Agent model"""
    __tablename__ = "agents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), unique=True, nullable=False)
    agent_type = Column(String(50), nullable=False)
    persona = Column(JSONB, nullable=False)
    config = Column(JSONB, default={})
    is_active = Column(Boolean, default=True)
    current_task_id = Column(UUID(as_uuid=True), nullable=True)  # Task queue: currently processing task
    is_busy = Column(Boolean, default=False)  # Quick check for agent availability
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    tasks = relationship("Task", back_populates="agent")
    memories = relationship("AgentMemory", back_populates="agent", cascade="all, delete-orphan")

    # Indexes for query optimization (Issue #47)
    __table_args__ = (
        Index('idx_agents_name', 'name'),  # Lookup by name (e.g., @orchestrator)
        Index('idx_agents_type', 'agent_type'),  # Filter by type
        Index('idx_agents_active', 'is_active'),  # Filter active agents
        Index('idx_agents_type_active', 'agent_type', 'is_active'),  # Combined filter
    )


class Channel(Base):
    """Channel model"""
    __tablename__ = "channels"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), unique=True, nullable=False)
    topic = Column(Text, nullable=True)
    is_archived = Column(Boolean, default=False)
    context_cleared_at = Column(DateTime(timezone=True), nullable=True)
    channel_type = Column(String(20), default="public", nullable=False)  # 'public', 'dm', 'private'
    dm_agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    messages = relationship("Message", back_populates="channel", cascade="all, delete-orphan")
    dm_agent = relationship("Agent", foreign_keys=[dm_agent_id])


class Message(Base):
    """Message model"""
    __tablename__ = "messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    channel_id = Column(UUID(as_uuid=True), ForeignKey("channels.id", ondelete="CASCADE"))
    author_id = Column(UUID(as_uuid=True), nullable=True)
    author_type = Column(String(10), nullable=False)  # 'user' or 'agent'
    author_name = Column(String(100), nullable=True)
    content = Column(Text, nullable=False)
    thread_id = Column(UUID(as_uuid=True), ForeignKey("messages.id"), nullable=True)
    msg_metadata = Column("metadata", JSONB, default={})
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    channel = relationship("Channel", back_populates="messages")
    thread_replies = relationship("Message", remote_side=[id])

    # Indexes for query optimization (Issue #47)
    __table_args__ = (
        Index('idx_messages_channel_id', 'channel_id'),  # Fetch messages by channel
        Index('idx_messages_created_at', 'created_at'),  # Order by timestamp
        Index('idx_messages_author_id', 'author_id'),  # Filter by author
        Index('idx_messages_channel_created', 'channel_id', 'created_at'),  # Combined for pagination
    )


class Task(Base):
    """Task model"""
    __tablename__ = "tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    description = Column(Text, nullable=False)
    assigned_to = Column(UUID(as_uuid=True), ForeignKey("agents.id"), nullable=True)
    status = Column(String(50), default="pending")
    priority = Column(String(20), default="medium")
    context = Column(JSONB, default={})
    result = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    agent = relationship("Agent", back_populates="tasks")


class AgentMemory(Base):
    """
    Agent memory model for semantic/RAG-based long-term memory

    Memory Types:
    - conversation: Chat messages and interactions
    - decision: Important decisions made
    - entity: Extracted entities (people, files, concepts)
    - summary: Condensed summaries of older context
    - tool_use: Record of tool calls and results
    """
    __tablename__ = "agent_memories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    channel_id = Column(UUID(as_uuid=True), ForeignKey("channels.id", ondelete="CASCADE"), nullable=True)

    # Content
    content = Column(Text, nullable=False)
    embedding = Column(Vector(768), nullable=True)  # nomic-embed-text (Ollama): 768 dims

    # Memory classification
    memory_type = Column(String(50), default="conversation")  # conversation, decision, entity, summary, tool_use
    importance = Column(Integer, default=5)  # 1-10 scale, affects retrieval priority

    # Metadata
    mem_metadata = Column("metadata", JSONB, default={})  # {message_id, author, tool_name, entities, etc.}

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    accessed_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    access_count = Column(Integer, default=0)  # Track usage for importance scoring

    # Relationships
    agent = relationship("Agent", back_populates="memories")


class Workflow(Base):
    """Workflow model for multi-agent orchestration"""
    __tablename__ = "workflows"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    description = Column(Text, nullable=False)
    orchestrator_id = Column(UUID(as_uuid=True), ForeignKey("agents.id"), nullable=False)
    channel_id = Column(UUID(as_uuid=True), ForeignKey("channels.id"), nullable=True)
    status = Column(String(50), default="pending")  # pending, planning, executing, completed, failed
    execution_strategy = Column(String(50), default="sequential")  # sequential, parallel, dag
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    workflow_tasks = relationship("WorkflowTask", back_populates="workflow", cascade="all, delete-orphan")

    # Indexes for query optimization (Issue #47)
    __table_args__ = (
        Index('idx_workflows_status', 'status'),  # Filter by status
        Index('idx_workflows_created_at', 'created_at'),  # Order by timestamp
        Index('idx_workflows_channel_id', 'channel_id'),  # Filter by channel
        Index('idx_workflows_status_created', 'status', 'created_at'),  # Combined for pagination
    )


class WorkflowTask(Base):
    """Individual task within a workflow"""
    __tablename__ = "workflow_tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workflow_id = Column(UUID(as_uuid=True), ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False)
    description = Column(Text, nullable=False)
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id"), nullable=False)
    order_index = Column(Integer, nullable=False)
    depends_on = Column(JSONB, default=list)  # List of task UUIDs
    status = Column(String(50), default="pending")
    output = Column(JSONB, nullable=True)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    workflow = relationship("Workflow", back_populates="workflow_tasks")
    agent = relationship("Agent")

    # Indexes for query optimization (Issue #47)
    __table_args__ = (
        Index('idx_workflow_tasks_workflow_id', 'workflow_id'),  # Fetch tasks by workflow
        Index('idx_workflow_tasks_status', 'status'),  # Filter by status
        Index('idx_workflow_tasks_order', 'order_index'),  # Order by execution order
        Index('idx_workflow_tasks_workflow_status', 'workflow_id', 'status'),  # Combined filter
    )


class UploadedFile(Base):
    """Uploaded file model for file upload feature"""
    __tablename__ = "uploaded_files"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    original_filename = Column(String(255), nullable=False)  # User's original filename
    stored_filename = Column(String(255), nullable=False)    # UUID + extension for safe storage
    workspace_path = Column(Text, nullable=False)            # Path in workspace: "uploads/YYYY-MM-DD/uuid.ext"
    file_size = Column(Integer, nullable=False)              # Size in bytes
    mime_type = Column(String(100), nullable=True)           # MIME type (e.g., "text/plain")
    message_id = Column(UUID(as_uuid=True), ForeignKey("messages.id", ondelete="CASCADE"), nullable=True)
    uploaded_by = Column(String(100), default="local-user")  # User identifier (for future multi-user)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    message = relationship("Message")


class AgentTemplate(Base):
    """
    Agent templates for Issue #18 - Custom agent creation
    Allows users to create custom agents with their own system prompts
    """
    __tablename__ = "agent_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), unique=True, nullable=False)  # Unique identifier (alphanumeric, lowercase)
    display_name = Column(String(100), nullable=False)  # Human-readable display name
    role = Column(String(200), nullable=False)  # Agent role/title
    system_prompt = Column(Text, nullable=False)  # Base system prompt for agents
    color = Column(String(7), nullable=True)  # Hex color (e.g., #FF0000)
    icon = Column(String(10), nullable=True)  # Emoji or icon name
    available_tools = Column(JSONB, default=list)  # List of MCP server names
    llm_config = Column(JSONB, default=dict)  # Provider, model, temperature config
    template_type = Column(String(50), default='custom')  # 'default', 'custom', 'community'
    domain = Column(String(100), nullable=True)  # Category: software-dev, marketing, legal, etc.
    is_public = Column(Boolean, default=False)  # Whether template is shared publicly
    created_by = Column(String(100), nullable=True)  # User ID or 'system'
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
