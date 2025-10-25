# Multi-Agent Workflow System Design

**Date**: 2025-10-24
**Issue**: #6 - Multi-Agent Orchestrated Workflows
**Status**: Design Phase

## 1. Overview

This document defines the architecture for coordinated multi-agent workflows in RezNet AI, where the @orchestrator agent can break down complex tasks and delegate them to specialist agents with proper dependency management and progress tracking.

## 2. Database Schema

### 2.1 Workflow Table

```python
class Workflow(Base):
    """Represents a multi-agent workflow"""
    __tablename__ = "workflows"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Workflow metadata
    description = Column(Text, nullable=False)  # User's original request
    orchestrator_id = Column(UUID(as_uuid=True), ForeignKey("agents.id"))
    channel_id = Column(UUID(as_uuid=True), ForeignKey("channels.id"))

    # State
    status = Column(String(50), default="planning")
    # Status: planning, executing, completed, failed, cancelled

    # Plan and results
    plan = Column(JSONB, nullable=True)
    # {
    #   "tasks": [{"description": "...", "agent": "backend", "depends_on": []}],
    #   "execution_order": ["sequential" | "parallel"],
    #   "estimated_duration": 180
    # }

    results = Column(JSONB, nullable=True)
    # {
    #   "summary": "Completed user authentication feature",
    #   "artifacts": ["backend/auth.py", "frontend/LoginForm.tsx"],
    #   "agent_outputs": {...}
    # }

    # Metadata
    error = Column(Text, nullable=True)  # Error message if failed
    metadata = Column(JSONB, default={})

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    orchestrator = relationship("Agent", foreign_keys=[orchestrator_id])
    channel = relationship("Channel")
    workflow_tasks = relationship("WorkflowTask", back_populates="workflow",
                                   cascade="all, delete-orphan")
```

### 2.2 WorkflowTask Table

```python
class WorkflowTask(Base):
    """Represents a single task within a workflow"""
    __tablename__ = "workflow_tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workflow_id = Column(UUID(as_uuid=True), ForeignKey("workflows.id", ondelete="CASCADE"))
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=True)

    # Task definition
    description = Column(Text, nullable=False)
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id"))
    order_index = Column(Integer, nullable=False)  # Execution order

    # Dependencies
    depends_on = Column(JSONB, default=[])  # Array of workflow_task IDs

    # State
    status = Column(String(50), default="pending")
    # Status: pending, ready, in_progress, completed, failed, skipped

    # Results
    output = Column(JSONB, nullable=True)
    error = Column(Text, nullable=True)
    metadata = Column(JSONB, default={})

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    workflow = relationship("Workflow", back_populates="workflow_tasks")
    agent = relationship("Agent")
    task = relationship("Task")  # Links to existing Task model
```

## 3. Workflow State Machine

```
┌─────────┐
│ PLANNING│ ← Orchestrator analyzes request and creates plan
└────┬────┘
     │
     ↓
┌──────────┐
│EXECUTING │ ← Tasks being executed by agents
└────┬─────┘
     │
     ├→ ┌──────────┐
     │  │COMPLETED │ ← All tasks succeeded
     │  └──────────┘
     │
     ├→ ┌──────┐
     │  │FAILED│ ← One or more tasks failed
     │  └──────┘
     │
     └→ ┌──────────┐
        │CANCELLED │ ← User cancelled workflow
        └──────────┘
```

### Task State Transitions

```
pending → ready → in_progress → completed
                              → failed

skipped (if dependency failed)
```

## 4. Workflow Orchestration Logic

### 4.1 Workflow Creation Flow

```python
# When user sends: "@orchestrator Build user authentication"
1. User message received
2. Orchestrator agent invoked
3. Orchestrator analyzes request → creates plan
4. Workflow created with status="planning"
5. WorkflowTasks created from plan
6. Workflow transitions to "executing"
7. Tasks executed based on dependencies
8. Progress updates sent via WebSocket
9. Results aggregated
10. Workflow marked "completed"
```

### 4.2 Task Execution Strategy

**Sequential Execution:**
```python
# Tasks with dependencies execute in order
Task 1 (no deps) → Task 2 (depends on 1) → Task 3 (depends on 2)
```

**Parallel Execution:**
```python
# Independent tasks execute simultaneously
Task 1 (no deps) ─┐
Task 2 (no deps) ─┼→ All run in parallel
Task 3 (no deps) ─┘
```

**Mixed (DAG - Directed Acyclic Graph):**
```python
Task 1 ────┐
Task 2 ────┼→ Task 4 → Task 6
Task 3 ────┘           ↑
Task 5 ────────────────┘
```

### 4.3 Dependency Resolution

```python
def get_ready_tasks(workflow_id):
    """Get tasks ready to execute (all dependencies completed)"""
    tasks = get_workflow_tasks(workflow_id, status="pending")
    ready_tasks = []

    for task in tasks:
        if not task.depends_on:
            # No dependencies, ready to execute
            ready_tasks.append(task)
        else:
            # Check if all dependencies are completed
            dependencies = get_tasks_by_ids(task.depends_on)
            if all(dep.status == "completed" for dep in dependencies):
                ready_tasks.append(task)

    return ready_tasks
```

## 5. API Schemas (Pydantic)

```python
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
from uuid import UUID

class WorkflowTaskCreate(BaseModel):
    description: str
    agent_id: UUID
    order_index: int
    depends_on: List[UUID] = []

class WorkflowTaskResponse(BaseModel):
    id: UUID
    workflow_id: UUID
    description: str
    agent_id: UUID
    order_index: int
    depends_on: List[UUID]
    status: str
    output: Optional[Dict[str, Any]]
    error: Optional[str]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True

class WorkflowCreate(BaseModel):
    description: str
    orchestrator_id: UUID
    channel_id: UUID

class WorkflowResponse(BaseModel):
    id: UUID
    description: str
    orchestrator_id: UUID
    channel_id: UUID
    status: str
    plan: Optional[Dict[str, Any]]
    results: Optional[Dict[str, Any]]
    error: Optional[str]
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    workflow_tasks: List[WorkflowTaskResponse] = []

    class Config:
        from_attributes = True

class WorkflowPlanRequest(BaseModel):
    """Request for orchestrator to create a workflow plan"""
    user_request: str
    channel_id: UUID
    context: Optional[Dict[str, Any]] = {}
```

## 6. WebSocket Events

```typescript
// Workflow lifecycle events
type WorkflowEvent =
  | { type: 'workflow:created', workflow_id: string, description: string }
  | { type: 'workflow:planning', workflow_id: string, orchestrator: string }
  | { type: 'workflow:plan_ready', workflow_id: string, plan: WorkflowPlan }
  | { type: 'workflow:started', workflow_id: string, total_tasks: number }
  | { type: 'workflow:progress', workflow_id: string, completed: number, total: number, percent: number }
  | { type: 'workflow:task_started', workflow_id: string, task_id: string, agent: string, description: string }
  | { type: 'workflow:task_completed', workflow_id: string, task_id: string, output: any }
  | { type: 'workflow:task_failed', workflow_id: string, task_id: string, error: string }
  | { type: 'workflow:completed', workflow_id: string, results: WorkflowResults }
  | { type: 'workflow:failed', workflow_id: string, error: string }
  | { type: 'workflow:cancelled', workflow_id: string };

interface WorkflowPlan {
  tasks: Array<{
    id: string;
    description: string;
    agent: string;
    depends_on: string[];
    estimated_duration?: number;
  }>;
  total_tasks: number;
  execution_strategy: 'sequential' | 'parallel' | 'dag';
}

interface WorkflowResults {
  summary: string;
  artifacts: string[];
  duration_seconds: number;
  agent_contributions: Record<string, string>;
}
```

## 7. API Endpoints

```python
# Workflow management
POST   /api/workflows              # Create workflow from user request
GET    /api/workflows              # List workflows
GET    /api/workflows/{id}         # Get workflow details
POST   /api/workflows/{id}/start   # Start workflow execution
POST   /api/workflows/{id}/cancel  # Cancel running workflow
DELETE /api/workflows/{id}         # Delete workflow

# Workflow tasks
GET    /api/workflows/{id}/tasks   # Get workflow tasks
PATCH  /api/workflows/{id}/tasks/{task_id}/status  # Update task status
```

## 8. Orchestration Service

### 8.1 WorkflowOrchestrator Class

```python
class WorkflowOrchestrator:
    """Manages workflow execution"""

    async def create_workflow_from_request(
        self,
        user_request: str,
        orchestrator_id: UUID,
        channel_id: UUID,
        db: Session
    ) -> Workflow:
        """
        1. Create workflow record
        2. Invoke orchestrator to create plan
        3. Parse plan and create WorkflowTasks
        4. Return workflow
        """
        pass

    async def execute_workflow(
        self,
        workflow_id: UUID,
        manager: ConnectionManager  # WebSocket manager
    ):
        """
        1. Load workflow and tasks
        2. While tasks remaining:
           a. Get ready tasks (dependencies met)
           b. Execute ready tasks in parallel
           c. Update task statuses
           d. Send progress updates via WebSocket
        3. Aggregate results
        4. Mark workflow complete/failed
        """
        pass

    async def execute_task(
        self,
        workflow_task: WorkflowTask,
        workflow: Workflow,
        db: Session
    ) -> Dict[str, Any]:
        """
        1. Load agent
        2. Build context from completed tasks
        3. Execute task via agent
        4. Return result
        """
        pass

    def build_task_context(
        self,
        workflow_task: WorkflowTask,
        workflow: Workflow,
        db: Session
    ) -> Dict[str, Any]:
        """
        Build context from:
        - Original user request
        - Completed dependency outputs
        - Conversation history
        """
        pass
```

### 8.2 Plan Parsing

```python
async def parse_orchestrator_plan(plan_text: str) -> Dict[str, Any]:
    """
    Parse orchestrator's response into structured plan

    Expected format from orchestrator:
    '''
    Task 1: @backend - Design database schema
    Task 2: @backend - Implement API endpoints (depends on Task 1)
    Task 3: @frontend - Build UI components
    Task 4: @qa - Write tests (depends on Task 2, Task 3)
    '''

    Returns:
    {
        "tasks": [
            {
                "order_index": 0,
                "description": "Design database schema",
                "agent": "backend",
                "depends_on_indices": []
            },
            ...
        ]
    }
    """
    pass
```

## 9. Enhanced Orchestrator Prompt

The orchestrator's system prompt should be updated to generate structured plans:

```python
ORCHESTRATOR_PLANNING_PROMPT = """
When creating a task plan, use this format:

Task 1: @agent_name - Clear description of what to do
Task 2: @agent_name - Description (depends on Task 1)
Task 3: @agent_name - Description (depends on Task 1, Task 2)

Rules:
1. Number tasks sequentially (Task 1, Task 2, etc.)
2. Always specify which agent (@backend, @frontend, @qa, @devops)
3. If a task depends on others, add "(depends on Task X)" or "(depends on Task X, Task Y)"
4. Be specific and actionable
5. Keep task descriptions concise (1-2 sentences)
6. Consider logical dependencies (e.g., tests depend on implementation)

Example:
Task 1: @backend - Create User model with email, password, and profile fields
Task 2: @backend - Implement registration API endpoint with validation (depends on Task 1)
Task 3: @frontend - Build registration form component with validation
Task 4: @qa - Write unit tests for registration endpoint (depends on Task 2)
Task 5: @qa - Write E2E test for registration flow (depends on Task 3, Task 2)
"""
```

## 10. Implementation Phases

### Phase 1: Database & Models ✅
- [ ] Add Workflow and WorkflowTask models to database.py
- [ ] Create Pydantic schemas in schemas.py
- [ ] Create Alembic migration
- [ ] Apply migration

### Phase 2: Orchestration Logic 🔨
- [ ] Create workflow_orchestrator.py
- [ ] Implement WorkflowOrchestrator class
- [ ] Implement plan parsing
- [ ] Implement dependency resolution
- [ ] Implement task execution

### Phase 3: API Endpoints 🔌
- [ ] Create routers/workflows.py
- [ ] Implement all workflow endpoints
- [ ] Add to main.py

### Phase 4: WebSocket Integration 📡
- [ ] Add workflow events to websocket/manager.py
- [ ] Integrate with WorkflowOrchestrator
- [ ] Test real-time updates

### Phase 5: Enhanced Orchestrator 🤖
- [ ] Update OrchestratorAgent.get_system_prompt()
- [ ] Add structured plan generation
- [ ] Test plan parsing

### Phase 6: Testing 🧪
- [ ] Unit tests for orchestration logic
- [ ] Integration tests for workflows
- [ ] E2E tests with real agents
- [ ] Test all example workflows from Issue #6

## 11. Example Workflow Execution

```
User: "@orchestrator Build user authentication"

1. Message received → Workflow created (status=planning)
2. Orchestrator invoked with planning prompt
3. Orchestrator responds:
   "Task 1: @backend - Create User database model
    Task 2: @backend - Implement JWT authentication endpoints (depends on Task 1)
    Task 3: @frontend - Build login form component
    Task 4: @qa - Write authentication tests (depends on Task 2)"

4. Plan parsed → 4 WorkflowTasks created
5. Workflow status → executing
6. Task 1 ready → @backend invoked
7. Task 1 completes → WebSocket: task_completed
8. Tasks 2, 3 ready → Both execute in parallel
9. Both complete
10. Task 4 ready → @qa invoked
11. Task 4 completes
12. All tasks done → Results aggregated
13. Workflow status → completed
14. WebSocket: workflow_completed
```

## 12. Success Metrics

- [ ] Orchestrator can break down complex requests into 3-10 tasks
- [ ] Dependencies correctly identified and enforced
- [ ] Sequential tasks execute in order
- [ ] Independent tasks execute in parallel
- [ ] Progress updates sent in real-time
- [ ] Failures handled gracefully (retry or mark workflow failed)
- [ ] Results properly aggregated and displayed
- [ ] All 3 example workflows from Issue #6 work end-to-end

---

**Next Steps**: Proceed to Phase 1 - Database implementation
