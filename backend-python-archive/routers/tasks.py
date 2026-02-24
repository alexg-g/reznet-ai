"""
Task endpoints
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID

from core.database import get_db
from models.database import Task, Agent
from models.schemas import TaskCreate, TaskResponse

router = APIRouter()


@router.get("/tasks", response_model=List[TaskResponse])
async def list_tasks(
    status: Optional[str] = None,
    assigned_to: Optional[UUID] = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """Get all tasks with optional filters"""
    query = db.query(Task)

    if status:
        query = query.filter(Task.status == status)
    if assigned_to:
        query = query.filter(Task.assigned_to == assigned_to)

    tasks = (
        query
        .order_by(Task.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return tasks


@router.post("/tasks", response_model=TaskResponse)
async def create_task(task: TaskCreate, db: Session = Depends(get_db)):
    """Create a new task"""
    # Validate agent exists if assigned
    if task.assigned_to:
        agent = db.query(Agent).filter(Agent.id == task.assigned_to).first()
        if not agent:
            raise HTTPException(status_code=404, detail="Assigned agent not found")

    db_task = Task(**task.dict())
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    return db_task


@router.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task(task_id: UUID, db: Session = Depends(get_db)):
    """Get task by ID"""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.patch("/tasks/{task_id}/status")
async def update_task_status(
    task_id: UUID,
    status: str,
    db: Session = Depends(get_db)
):
    """Update task status"""
    valid_statuses = ['pending', 'in_progress', 'completed', 'failed', 'cancelled']
    if status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}"
        )

    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    task.status = status

    # Update timestamps based on status
    from datetime import datetime
    if status == 'in_progress' and not task.started_at:
        task.started_at = datetime.utcnow()
    elif status in ['completed', 'failed', 'cancelled'] and not task.completed_at:
        task.completed_at = datetime.utcnow()

    db.commit()
    db.refresh(task)
    return task


@router.post("/tasks/{task_id}/cancel")
async def cancel_task(task_id: UUID, db: Session = Depends(get_db)):
    """Cancel a running task"""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task.status in ['completed', 'failed', 'cancelled']:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel task with status: {task.status}"
        )

    task.status = 'cancelled'
    from datetime import datetime
    task.completed_at = datetime.utcnow()

    db.commit()
    return {"message": "Task cancelled successfully"}


@router.delete("/tasks/{task_id}")
async def delete_task(task_id: UUID, db: Session = Depends(get_db)):
    """Delete a task"""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    db.delete(task)
    db.commit()
    return {"message": "Task deleted successfully"}
