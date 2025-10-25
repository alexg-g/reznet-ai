# Multi-Agent Workflow System - Testing Guide

**Date**: 2025-10-24
**Issue**: #6 - Multi-Agent Orchestrated Workflows
**Status**: ✅ Implementation Complete - Ready for Testing

---

## What's Been Built

###  1. Database Schema ✅
- **`workflows` table** - Stores workflow metadata, status, plan, and results
- **`workflow_tasks` table** - Individual tasks with dependencies and execution state
- Tables created successfully in PostgreSQL

### 2. Workflow Orchestration Engine ✅
**File**: `backend/agents/workflow_orchestrator.py`

**Key Features**:
- Task dependency resolution (DAG support)
- Parallel execution of independent tasks
- Sequential execution of dependent tasks
- Real-time progress tracking via WebSocket
- Error handling and workflow cancellation
- Result aggregation

### 3. REST API Endpoints ✅
**File**: `backend/routers/workflows.py`

**Endpoints**:
```
POST   /api/workflows/plan          # Create workflow from user request
POST   /api/workflows                # Create workflow manually
GET    /api/workflows                # List all workflows
GET    /api/workflows/{id}           # Get workflow details
POST   /api/workflows/{id}/start     # Start workflow execution
POST   /api/workflows/{id}/cancel    # Cancel running workflow
DELETE /api/workflows/{id}           # Delete workflow
GET    /api/workflows/{id}/tasks     # Get workflow tasks
```

### 4. Enhanced Orchestrator Agent ✅
**File**: `backend/agents/specialists.py`

**Improvements**:
- Structured task planning format
- Clear dependency syntax
- Better agent assignment logic
- Examples in system prompt

### 5. Pydantic Schemas ✅
**File**: `backend/models/schemas.py`

- `WorkflowCreate`, `WorkflowResponse`
- `WorkflowTaskCreate`, `WorkflowTaskResponse`
- `WorkflowPlanRequest`
- `WorkflowProgressUpdate`
- WebSocket event types for workflows

### 6. WebSocket Integration ✅
**Built into WorkflowOrchestrator**

**Events Broadcasted**:
- `workflow:created`
- `workflow:planning`
- `workflow:plan_ready`
- `workflow:started`
- `workflow:progress`
- `workflow:task_started`
- `workflow:task_completed`
- `workflow:task_failed`
- `workflow:completed`
- `workflow:failed`
- `workflow:cancelled`

---

## Testing Workflow System

### Prerequisites

1. **Start Services**:
```bash
# Terminal 1: Start Docker (PostgreSQL + Redis)
docker-compose up -d

# Terminal 2: Start backend
cd backend
source venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Terminal 3: Start frontend (optional for full UI testing)
cd frontend
npm run dev
```

2. **Verify Database**:
```bash
docker exec -it reznet-postgres psql -U postgres -d reznetai_local

# Check tables exist
\dt

# Should see: workflows, workflow_tasks, agents, channels, messages, tasks
```

---

## Test Scenarios

### Test 1: Simple Sequential Workflow

**Request**:
```bash
curl -X POST http://localhost:8000/api/workflows/plan \
  -H "Content-Type: application/json" \
  -d '{
    "user_request": "Create a simple user profile page",
    "channel_id": "00000000-0000-0000-0000-000000000001",
    "context": {}
  }'
```

**Expected Plan**:
```
Task 1: @backend - Create User profile API endpoint
Task 2: @frontend - Create ProfilePage component (depends on Task 1)
Task 3: @qa - Write tests for profile functionality (depends on Task 1, Task 2)
```

**Start Execution**:
```bash
curl -X POST http://localhost:8000/api/workflows/{workflow_id}/start
```

**Expected Behavior**:
1. Orchestrator creates plan
2. Task 1 starts immediately (no dependencies)
3. Task 2 starts after Task 1 completes
4. Task 3 starts after both complete
5. WebSocket events broadcast progress

---

### Test 2: Parallel Workflow

**Request**:
```bash
curl -X POST http://localhost:8000/api/workflows/plan \
  -H "Content-Type: application/json" \
  -d '{
    "user_request": "Add dark mode and improve accessibility",
    "channel_id": "00000000-0000-0000-0000-000000000001"
  }'
```

**Expected Plan**:
```
Task 1: @frontend - Implement dark mode theme toggle
Task 2: @frontend - Add ARIA labels and keyboard navigation
Task 3: @qa - Test dark mode in different browsers
Task 4: @qa - Run accessibility audit with axe-core
```

**Expected Behavior**:
- Tasks 1 & 2 execute in parallel (no dependencies)
- Tasks 3 & 4 execute in parallel after their dependencies

---

### Test 3: Complex DAG Workflow

**Request**:
```bash
curl -X POST http://localhost:8000/api/workflows/plan \
  -H "Content-Type: application/json" \
  -d '{
    "user_request": "Build a complete authentication system with JWT tokens",
    "channel_id": "00000000-0000-0000-0000-000000000001"
  }'
```

**Expected Plan** (example):
```
Task 1: @backend - Create User database model
Task 2: @backend - Implement registration endpoint (depends on Task 1)
Task 3: @backend - Implement login endpoint with JWT (depends on Task 1)
Task 4: @frontend - Create LoginForm component
Task 5: @frontend - Create RegistrationForm component
Task 6: @qa - Write backend auth tests (depends on Task 2, Task 3)
Task 7: @qa - Write E2E tests (depends on Task 4, Task 5, Task 6)
Task 8: @devops - Document deployment requirements (depends on Task 7)
```

**Expected Execution Flow**:
```
Step 1: Task 1 (backend - User model)
Step 2: Tasks 2, 3, 4, 5 in parallel
Step 3: Task 6 (after 2, 3 complete)
Step 4: Task 7 (after 4, 5, 6 complete)
Step 5: Task 8 (after 7 completes)
```

---

## Test via API Docs

1. Open http://localhost:8000/docs
2. Navigate to `/api/workflows/plan` endpoint
3. Try it out with test data
4. Monitor responses and database

---

## Test via Frontend (if running)

1. Open http://localhost:3000
2. Send message: `@orchestrator Build user authentication`
3. Watch for:
   - Orchestrator response with task breakdown
   - Workflow created notification
   - Real-time progress updates

---

## Monitoring Workflow Execution

### Check Workflow Status
```bash
curl http://localhost:8000/api/workflows
```

### Get Workflow Details
```bash
curl http://localhost:8000/api/workflows/{workflow_id}
```

### Get Workflow Tasks
```bash
curl http://localhost:8000/api/workflows/{workflow_id}/tasks
```

### Database Queries
```sql
-- Check workflows
SELECT id, description, status, created_at FROM workflows ORDER BY created_at DESC LIMIT 5;

-- Check workflow tasks
SELECT wf.description as workflow, wt.description as task, wt.status, a.name as agent
FROM workflow_tasks wt
JOIN workflows wf ON wt.workflow_id = wf.id
JOIN agents a ON wt.agent_id = a.id
ORDER BY wf.created_at DESC, wt.order_index;
```

---

## Debugging

### Enable Debug Logging
Set in `.env`:
```
DEBUG=true
LOG_LEVEL=DEBUG
```

### Common Issues

**1. Orchestrator doesn't create valid plan**
- Check `backend/agents/specialists.py` - Orchestrator system prompt
- LLM may need better examples or stricter formatting

**2. Tasks not executing**
- Check dependencies - circular dependencies cause deadlock
- Verify agents exist in database
- Check agent status is `active`

**3. WebSocket events not received**
- Verify frontend connected to Socket.IO
- Check browser console for connection errors
- Backend logs show WebSocket connections

**4. Database errors**
- Run `docker-compose logs postgres`
- Verify workflow tables exist
- Check foreign key constraints

---

## Example Test Workflow (Manual)

### 1. Create Workflow
```bash
WORKFLOW_RESPONSE=$(curl -s -X POST http://localhost:8000/api/workflows/plan \
  -H "Content-Type: application/json" \
  -d '{
    "user_request": "Create a simple todo list feature",
    "channel_id": "00000000-0000-0000-0000-000000000001"
  }')

echo $WORKFLOW_RESPONSE | jq '.'

WORKFLOW_ID=$(echo $WORKFLOW_RESPONSE | jq -r '.id')
```

### 2. Check Plan
```bash
curl -s http://localhost:8000/api/workflows/$WORKFLOW_ID | jq '.plan'
```

### 3. Start Execution
```bash
curl -X POST http://localhost:8000/api/workflows/$WORKFLOW_ID/start
```

### 4. Monitor Progress
```bash
# Watch in real-time
watch -n 1 "curl -s http://localhost:8000/api/workflows/$WORKFLOW_ID | jq '.status, .workflow_tasks[].status'"
```

### 5. Check Results
```bash
curl -s http://localhost:8000/api/workflows/$WORKFLOW_ID | jq '.results'
```

---

## Success Criteria

- [ ] Orchestrator creates valid task plans in correct format
- [ ] Tasks parsed correctly from plan
- [ ] Dependencies resolved properly
- [ ] Independent tasks execute in parallel
- [ ] Dependent tasks execute sequentially
- [ ] WebSocket events broadcast in real-time
- [ ] Workflow completes successfully
- [ ] Results aggregated correctly
- [ ] Errors handled gracefully
- [ ] Can cancel running workflows

---

## Next Steps

After testing confirms everything works:

1. **Issue #14**: Build workflow visualization UI
2. **Issue #11**: Create pre-built demo workflows
3. **Issue #13**: Integrate with GitHub for PR creation
4. **Issue #12**: Add code execution sandbox

---

**Ready to test!** 🚀

Start the backend and try Test Scenario 1 to validate the system works end-to-end.
