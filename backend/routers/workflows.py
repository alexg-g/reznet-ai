"""
Workflow API endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID

from core.database import get_db
from models.database import Workflow, WorkflowTask, Agent
from models.schemas import (
    WorkflowCreate,
    WorkflowResponse,
    WorkflowPlanRequest,
    WorkflowTaskResponse
)
from agents.workflow_orchestrator import WorkflowOrchestrator
from websocket.manager import manager

router = APIRouter()


@router.post("/workflows/plan", response_model=WorkflowResponse)
async def create_workflow_from_plan_request(
    request: WorkflowPlanRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Create a workflow from a user request

    The orchestrator will:
    1. Analyze the request
    2. Create a task breakdown
    3. Assign tasks to appropriate agents
    4. Return the workflow with pending tasks

    The workflow can then be started with POST /workflows/{id}/start
    """
    try:
        # Get orchestrator agent
        orchestrator = db.query(Agent).filter(
            Agent.agent_type == "orchestrator",
            Agent.is_active == True
        ).first()

        if not orchestrator:
            raise HTTPException(
                status_code=500,
                detail="Orchestrator agent not found or inactive"
            )

        # Create workflow orchestrator
        orchestrator_service = WorkflowOrchestrator(manager)

        # Create workflow with plan
        workflow = await orchestrator_service.create_workflow_from_request(
            user_request=request.user_request,
            orchestrator_id=orchestrator.id,
            channel_id=request.channel_id,
            db=db
        )

        # Refresh to get relationships
        db.refresh(workflow)

        return workflow

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/workflows", response_model=WorkflowResponse)
async def create_workflow(
    workflow: WorkflowCreate,
    db: Session = Depends(get_db)
):
    """
    Create a workflow manually (without orchestrator planning)

    Use /workflows/plan instead for automatic task breakdown
    """
    # Validate orchestrator exists
    orchestrator = db.query(Agent).filter(
        Agent.id == workflow.orchestrator_id
    ).first()

    if not orchestrator:
        raise HTTPException(status_code=404, detail="Orchestrator not found")

    db_workflow = Workflow(**workflow.dict())
    db.add(db_workflow)
    db.commit()
    db.refresh(db_workflow)

    return db_workflow


@router.get("/workflows", response_model=List[WorkflowResponse])
async def list_workflows(
    status: Optional[str] = None,
    channel_id: Optional[UUID] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """Get all workflows with optional filters"""
    query = db.query(Workflow)

    if status:
        query = query.filter(Workflow.status == status)
    if channel_id:
        query = query.filter(Workflow.channel_id == channel_id)

    workflows = (
        query
        .order_by(Workflow.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return workflows


@router.get("/workflows/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow(workflow_id: UUID, db: Session = Depends(get_db)):
    """Get workflow by ID with all tasks"""
    workflow = db.query(Workflow).filter(
        Workflow.id == workflow_id
    ).first()

    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    return workflow


@router.post("/workflows/{workflow_id}/start")
async def start_workflow(
    workflow_id: UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Start workflow execution

    This will execute all tasks in the workflow based on their dependencies.
    Tasks are executed in parallel where possible.

    Returns immediately - progress updates sent via WebSocket
    """
    workflow = db.query(Workflow).filter(
        Workflow.id == workflow_id
    ).first()

    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    if workflow.status not in ["planning", "failed"]:
        raise HTTPException(
            status_code=400,
            detail=f"Workflow cannot be started (status: {workflow.status})"
        )

    # Create orchestrator
    orchestrator_service = WorkflowOrchestrator(manager)

    # Execute workflow in background
    background_tasks.add_task(
        orchestrator_service.execute_workflow,
        workflow_id,
        db
    )

    return {
        "message": "Workflow execution started",
        "workflow_id": str(workflow_id),
        "status": "executing"
    }


@router.post("/workflows/{workflow_id}/cancel")
async def cancel_workflow(
    workflow_id: UUID,
    db: Session = Depends(get_db)
):
    """Cancel a running workflow"""
    workflow = db.query(Workflow).filter(
        Workflow.id == workflow_id
    ).first()

    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    if workflow.status != "executing":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel workflow with status: {workflow.status}"
        )

    # Create orchestrator and cancel
    orchestrator_service = WorkflowOrchestrator(manager)
    await orchestrator_service.cancel_workflow(workflow_id, db)

    return {"message": "Workflow cancelled successfully"}


@router.delete("/workflows/{workflow_id}")
async def delete_workflow(workflow_id: UUID, db: Session = Depends(get_db)):
    """Delete a workflow and all its tasks"""
    workflow = db.query(Workflow).filter(
        Workflow.id == workflow_id
    ).first()

    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    if workflow.status == "executing":
        raise HTTPException(
            status_code=400,
            detail="Cannot delete workflow while executing. Cancel it first."
        )

    db.delete(workflow)
    db.commit()

    return {"message": "Workflow deleted successfully"}


@router.get("/workflows/{workflow_id}/tasks", response_model=List[WorkflowTaskResponse])
async def get_workflow_tasks(
    workflow_id: UUID,
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all tasks for a workflow"""
    query = db.query(WorkflowTask).filter(
        WorkflowTask.workflow_id == workflow_id
    )

    if status:
        query = query.filter(WorkflowTask.status == status)

    tasks = query.order_by(WorkflowTask.order_index).all()

    return tasks


@router.get("/workflows/{workflow_id}/tasks/{task_id}", response_model=WorkflowTaskResponse)
async def get_workflow_task(
    workflow_id: UUID,
    task_id: UUID,
    db: Session = Depends(get_db)
):
    """Get a specific workflow task"""
    task = db.query(WorkflowTask).filter(
        WorkflowTask.id == task_id,
        WorkflowTask.workflow_id == workflow_id
    ).first()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    return task
