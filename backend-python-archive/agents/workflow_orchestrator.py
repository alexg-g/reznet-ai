"""
Workflow Orchestration System

Manages multi-agent workflow execution with dependency tracking,
parallel/sequential execution, and real-time progress updates.
"""

import asyncio
import re
from typing import Dict, Any, List, Optional
from uuid import UUID
from datetime import datetime, timezone
import logging
from sqlalchemy.orm import Session

from models.database import Workflow, WorkflowTask, Agent, Message
from agents.processor import get_agent_instance
from websocket.manager import ConnectionManager
from utils.text_parsing import strip_markdown, extract_agent_names_from_task_line

logger = logging.getLogger(__name__)


class WorkflowOrchestrator:
    """Manages workflow execution and coordination"""

    def __init__(self, manager: ConnectionManager):
        """
        Initialize workflow orchestrator

        Args:
            manager: WebSocket connection manager for real-time updates
        """
        self.manager = manager
        self.active_workflows: Dict[UUID, bool] = {}  # Track running workflows

    async def create_workflow_from_request(
        self,
        user_request: str,
        orchestrator_id: UUID,
        channel_id: UUID,
        db: Session
    ) -> Workflow:
        """
        Create a workflow from user request

        Steps:
        1. Create workflow record
        2. Invoke orchestrator to create plan
        3. Parse plan and create WorkflowTasks
        4. Return workflow

        Args:
            user_request: User's original request
            orchestrator_id: ID of orchestrator agent
            channel_id: Channel where request was made
            db: Database session

        Returns:
            Created workflow with tasks
        """
        try:
            logger.info(f"Creating workflow for request: {user_request[:100]}")

            # Create workflow record
            workflow = Workflow(
                description=user_request,
                orchestrator_id=orchestrator_id,
                channel_id=channel_id,
                status="planning"
            )
            db.add(workflow)
            db.commit()
            db.refresh(workflow)

            # Broadcast workflow created event
            await self.manager.broadcast('workflow:created', {
                'workflow_id': str(workflow.id),
                'description': workflow.description
            })

            # Get orchestrator agent
            orchestrator_record = db.query(Agent).filter(
                Agent.id == orchestrator_id
            ).first()

            if not orchestrator_record:
                raise ValueError("Orchestrator agent not found")

            orchestrator = get_agent_instance(orchestrator_record)

            # Broadcast planning status
            await self.manager.broadcast('workflow:planning', {
                'workflow_id': str(workflow.id),
                'orchestrator': orchestrator_record.name
            })

            # Get orchestrator to create plan
            planning_prompt = self._build_planning_prompt(user_request)
            plan_response = await orchestrator.process_message(
                planning_prompt,
                context={"workflow_id": str(workflow.id)}
            )

            logger.info(f"Orchestrator plan: {plan_response}")

            # Parse plan and create tasks
            tasks = await self._parse_plan(plan_response, workflow.id, db)

            if not tasks:
                raise ValueError("Orchestrator did not create a valid plan")

            # Store plan in workflow
            workflow.plan = {
                "raw_response": plan_response,
                "total_tasks": len(tasks),
                "execution_strategy": self._determine_execution_strategy(tasks)
            }
            db.commit()

            # Broadcast plan ready
            await self.manager.broadcast('workflow:plan_ready', {
                'workflow_id': str(workflow.id),
                'plan': {
                    'total_tasks': len(tasks),
                    'tasks': [
                        {
                            'id': str(t.id),
                            'description': t.description,
                            'agent': t.agent.name,
                            'order': t.order_index,
                            'depends_on': t.depends_on
                        }
                        for t in tasks
                    ]
                }
            })

            logger.info(f"Workflow {workflow.id} created with {len(tasks)} tasks")

            return workflow

        except Exception as e:
            logger.error(f"Error creating workflow: {e}")
            if 'workflow' in locals():
                workflow.status = "failed"
                workflow.error = str(e)
                db.commit()
            raise

    def _build_planning_prompt(self, user_request: str) -> str:
        """
        Build prompt for orchestrator to create task plan

        Args:
            user_request: Original user request

        Returns:
            Formatted planning prompt
        """
        return f"""Create a detailed task plan for this request:

{user_request}

Break this down into specific, actionable tasks. For each task:
1. Assign it to the appropriate agent (@backend, @frontend, @qa, @devops)
2. Provide a clear description of what needs to be done
3. **ALWAYS include the file path where code should be written**
4. Identify any dependencies on other tasks

Use this EXACT format (very important):

Task 1: @agent_name - Description of task 1 in path/to/file.ext
Task 2: @agent_name - Description of task 2 in path/to/file2.ext (depends on Task 1)
Task 3: @agent_name - Description of task 3 in path/to/file3.ext
Task 4: @agent_name - Description of task 4 in path/to/file4.ext (depends on Task 2, Task 3)

Guidelines:
- Number tasks sequentially starting from 1
- Always specify agent with @ symbol
- **CRITICAL: Include file paths in every task description** (e.g., "in backend/app.py" or "in frontend/App.tsx")
- Keep descriptions specific and actionable
- Only add dependencies if task actually requires previous task outputs
- Think about what can run in parallel vs. sequentially
- Agents will create actual files at these paths, so be specific!

Example:
Task 1: @backend - Create Flask application with /flip endpoint in backend/app.py
Task 2: @frontend - Build CoinFlip React component with flip button in frontend/src/CoinFlip.tsx
Task 3: @qa - Write unit tests for flip endpoint in tests/test_app.py (depends on Task 1)

Create the plan now:"""

    async def _parse_plan(
        self,
        plan_text: str,
        workflow_id: UUID,
        db: Session
    ) -> List[WorkflowTask]:
        """
        Parse orchestrator's plan into WorkflowTask objects

        Expected format:
        Task 1: @backend - Design database schema
        Task 2: @backend - Implement API endpoints (depends on Task 1)
        Task 3: @frontend - Build UI components

        Args:
            plan_text: Orchestrator's response
            workflow_id: Workflow ID
            db: Database session

        Returns:
            List of created WorkflowTask objects
        """
        tasks = []
        task_map = {}  # Map task numbers to WorkflowTask objects

        # Regular expression to match task lines
        # Updated to handle optional markdown formatting (bold, headers, etc.)
        task_pattern = r'Task\s+(\d+):\s*@(\w+)\s*-\s*(.+?)(?:\(depends on\s+(.+?)\))?$'

        lines = plan_text.split('\n')
        for line in lines:
            line = line.strip()

            # Strip markdown formatting using centralized utility
            line = strip_markdown(line)

            match = re.match(task_pattern, line, re.IGNORECASE)

            if match:
                task_num = int(match.group(1))
                agent_name = match.group(2).lower()
                description = match.group(3).strip()
                depends_str = match.group(4)

                # Get agent from database
                agent = db.query(Agent).filter(
                    Agent.name == f"@{agent_name}"
                ).first()

                if not agent:
                    logger.warning(f"Agent not found: @{agent_name}, skipping task")
                    continue

                # Parse dependencies
                depends_on = []
                if depends_str:
                    # Extract task numbers from "Task 1, Task 2" format
                    dep_matches = re.findall(r'Task\s+(\d+)', depends_str, re.IGNORECASE)
                    depends_on = [int(d) for d in dep_matches]

                # Create WorkflowTask
                workflow_task = WorkflowTask(
                    workflow_id=workflow_id,
                    description=description,
                    agent_id=agent.id,
                    order_index=task_num - 1,  # 0-indexed
                    depends_on=[],  # Will update after all tasks created
                    status="pending"
                )

                db.add(workflow_task)
                db.flush()  # Get ID without committing

                task_map[task_num] = {
                    'task': workflow_task,
                    'depends_on_numbers': depends_on
                }

                tasks.append(workflow_task)

        # Now update dependencies with actual UUIDs
        for task_info in task_map.values():
            task = task_info['task']
            dep_numbers = task_info['depends_on_numbers']

            if dep_numbers:
                dep_uuids = []
                for dep_num in dep_numbers:
                    if dep_num in task_map:
                        dep_uuids.append(str(task_map[dep_num]['task'].id))
                task.depends_on = dep_uuids

        db.commit()

        logger.info(f"Parsed {len(tasks)} tasks from plan")
        return tasks

    def _determine_execution_strategy(self, tasks: List[WorkflowTask]) -> str:
        """
        Determine execution strategy based on task dependencies

        Args:
            tasks: List of workflow tasks

        Returns:
            "sequential", "parallel", or "dag"
        """
        has_dependencies = any(task.depends_on for task in tasks)

        if not has_dependencies:
            return "parallel"  # All tasks independent
        elif all(
            len(task.depends_on) <= 1 for task in tasks if task.depends_on
        ):
            return "sequential"  # Simple chain
        else:
            return "dag"  # Complex dependency graph

    async def execute_workflow(
        self,
        workflow_id: UUID,
        db: Session
    ):
        """
        Execute a workflow

        This runs the workflow execution loop:
        1. Get ready tasks (dependencies met)
        2. Execute tasks (in parallel where possible)
        3. Update progress
        4. Repeat until done

        Args:
            workflow_id: Workflow to execute
            db: Database session
        """
        try:
            self.active_workflows[workflow_id] = True

            # Load workflow
            workflow = db.query(Workflow).filter(
                Workflow.id == workflow_id
            ).first()

            if not workflow:
                raise ValueError(f"Workflow {workflow_id} not found")

            logger.info(f"Starting workflow execution: {workflow_id}")

            # Update status
            workflow.status = "executing"
            workflow.started_at = datetime.now(timezone.utc)
            db.commit()

            # Broadcast started event
            total_tasks = len(workflow.workflow_tasks)
            await self.manager.broadcast('workflow:started', {
                'workflow_id': str(workflow.id),
                'total_tasks': total_tasks
            })

            # Execute tasks
            completed_count = 0
            failed = False

            while completed_count < total_tasks and not failed:
                # Get ready tasks
                ready_tasks = self._get_ready_tasks(workflow, db)

                if not ready_tasks:
                    # No more ready tasks but not all completed = deadlock
                    logger.error(f"Workflow deadlock detected: {workflow_id}")
                    failed = True
                    workflow.error = "Task dependency deadlock detected"
                    break

                # Execute ready tasks in parallel
                task_results = await asyncio.gather(*[
                    self._execute_task(task, workflow, db)
                    for task in ready_tasks
                ], return_exceptions=True)

                # Process results
                for task, result in zip(ready_tasks, task_results):
                    if isinstance(result, Exception):
                        logger.error(f"Task {task.id} failed: {result}")
                        task.status = "failed"
                        task.error = str(result)
                        failed = True
                    else:
                        completed_count += 1

                        # Broadcast progress
                        percent = int((completed_count / total_tasks) * 100)
                        await self.manager.broadcast('workflow:progress', {
                            'workflow_id': str(workflow.id),
                            'completed': completed_count,
                            'total': total_tasks,
                            'percent': percent
                        })

                db.commit()

                # Check if cancelled
                if not self.active_workflows.get(workflow_id, False):
                    workflow.status = "cancelled"
                    db.commit()
                    await self.manager.broadcast('workflow:cancelled', {
                        'workflow_id': str(workflow.id)
                    })
                    return

            # Finalize workflow
            if failed:
                workflow.status = "failed"
                await self.manager.broadcast('workflow:failed', {
                    'workflow_id': str(workflow.id),
                    'error': workflow.error or "One or more tasks failed"
                })

                # Post failure message to channel
                failure_msg = Message(
                    channel_id=workflow.channel_id,
                    author_id=workflow.orchestrator_id,
                    author_type='agent',
                    author_name='@orchestrator',
                    content=f"❌ Workflow failed: {workflow.error or 'One or more tasks failed'}",
                    metadata={'workflow_id': str(workflow.id)}
                )
                db.add(failure_msg)
                db.commit()
                db.refresh(failure_msg)

                await self.manager.broadcast('message_new', {
                    'id': str(failure_msg.id),
                    'channel_id': str(failure_msg.channel_id),
                    'author_type': failure_msg.author_type,
                    'author_name': failure_msg.author_name,
                    'content': failure_msg.content,
                    'created_at': failure_msg.created_at.isoformat(),
                    'metadata': failure_msg.msg_metadata
                })
            else:
                workflow.status = "completed"
                workflow.completed_at = datetime.now(timezone.utc)

                # Aggregate results
                results = self._aggregate_results(workflow)
                workflow.results = results

                await self.manager.broadcast('workflow:completed', {
                    'workflow_id': str(workflow.id),
                    'results': results
                })

                # Build completion summary with task outputs
                summary_parts = [f"✅ Workflow completed successfully! ({results['completed_tasks']}/{results['total_tasks']} tasks)"]

                if results.get('duration_seconds'):
                    summary_parts.append(f"\n⏱️ Duration: {results['duration_seconds']:.1f}s")

                summary_parts.append("\n\n**Agent Contributions:**")
                for agent_name, output in results.get('agent_contributions', {}).items():
                    summary_parts.append(f"\n• {agent_name}: {output[:150]}...")

                completion_msg = Message(
                    channel_id=workflow.channel_id,
                    author_id=workflow.orchestrator_id,
                    author_type='agent',
                    author_name='@orchestrator',
                    content=''.join(summary_parts),
                    metadata={'workflow_id': str(workflow.id), 'results': results}
                )
                db.add(completion_msg)
                db.commit()
                db.refresh(completion_msg)

                await self.manager.broadcast('message_new', {
                    'id': str(completion_msg.id),
                    'channel_id': str(completion_msg.channel_id),
                    'author_type': completion_msg.author_type,
                    'author_name': completion_msg.author_name,
                    'content': completion_msg.content,
                    'created_at': completion_msg.created_at.isoformat(),
                    'metadata': completion_msg.msg_metadata
                })

            db.commit()

            logger.info(f"Workflow {workflow_id} finished with status: {workflow.status}")

        except Exception as e:
            logger.error(f"Error executing workflow {workflow_id}: {e}")
            workflow.status = "failed"
            workflow.error = str(e)
            db.commit()

            await self.manager.broadcast('workflow:failed', {
                'workflow_id': str(workflow_id),
                'error': str(e)
            })

            # Post error message to channel
            error_msg = Message(
                channel_id=workflow.channel_id,
                author_id=workflow.orchestrator_id,
                author_type='agent',
                author_name='@orchestrator',
                content=f"❌ Workflow execution error: {str(e)}",
                metadata={'workflow_id': str(workflow.id), 'error': str(e)}
            )
            db.add(error_msg)
            db.commit()
            db.refresh(error_msg)

            await self.manager.broadcast('message_new', {
                'id': str(error_msg.id),
                'channel_id': str(error_msg.channel_id),
                'author_type': error_msg.author_type,
                'author_name': error_msg.author_name,
                'content': error_msg.content,
                'created_at': error_msg.created_at.isoformat(),
                'metadata': error_msg.msg_metadata
            })

        finally:
            self.active_workflows.pop(workflow_id, None)

    def _get_ready_tasks(self, workflow: Workflow, db: Session) -> List[WorkflowTask]:
        """
        Get tasks that are ready to execute
        (status=pending and all dependencies completed)

        Args:
            workflow: Workflow object
            db: Database session

        Returns:
            List of ready WorkflowTask objects
        """
        ready_tasks = []

        for task in workflow.workflow_tasks:
            if task.status != "pending":
                continue

            # Check if all dependencies are completed
            if not task.depends_on:
                # No dependencies, ready to go
                ready_tasks.append(task)
            else:
                # Check each dependency
                deps_completed = True
                for dep_id in task.depends_on:
                    dep_task = db.query(WorkflowTask).filter(
                        WorkflowTask.id == UUID(dep_id)
                    ).first()

                    if not dep_task or dep_task.status != "completed":
                        deps_completed = False
                        break

                if deps_completed:
                    ready_tasks.append(task)

        return ready_tasks

    async def _execute_task(
        self,
        workflow_task: WorkflowTask,
        workflow: Workflow,
        db: Session
    ) -> Dict[str, Any]:
        """
        Execute a single workflow task

        Args:
            workflow_task: Task to execute
            workflow: Parent workflow
            db: Database session

        Returns:
            Task result
        """
        try:
            logger.info(f"Executing task {workflow_task.id}: {workflow_task.description}")

            # Update status
            workflow_task.status = "in_progress"
            workflow_task.started_at = datetime.now(timezone.utc)
            db.commit()

            # Broadcast task started
            await self.manager.broadcast('workflow:task_started', {
                'workflow_id': str(workflow.id),
                'task_id': str(workflow_task.id),
                'agent': workflow_task.agent.name,
                'description': workflow_task.description
            })

            # Build context
            context = self._build_task_context(workflow_task, workflow, db)

            # Get agent and execute
            agent = get_agent_instance(workflow_task.agent)
            response = await agent.process_message(
                workflow_task.description,
                context
            )

            # Store result
            workflow_task.output = {
                "response": response,
                "agent": workflow_task.agent.name
            }
            workflow_task.status = "completed"
            workflow_task.completed_at = datetime.now(timezone.utc)
            db.commit()

            # Broadcast task completed
            await self.manager.broadcast('workflow:task_completed', {
                'workflow_id': str(workflow.id),
                'task_id': str(workflow_task.id),
                'output': workflow_task.output
            })

            logger.info(f"Task {workflow_task.id} completed successfully")

            return workflow_task.output

        except Exception as e:
            logger.error(f"Error executing task {workflow_task.id}: {e}")
            workflow_task.status = "failed"
            workflow_task.error = str(e)
            workflow_task.completed_at = datetime.now(timezone.utc)
            db.commit()

            await self.manager.broadcast('workflow:task_failed', {
                'workflow_id': str(workflow.id),
                'task_id': str(workflow_task.id),
                'error': str(e)
            })

            raise

    def _build_task_context(
        self,
        workflow_task: WorkflowTask,
        workflow: Workflow,
        db: Session
    ) -> Dict[str, Any]:
        """
        Build context for task execution

        Includes:
        - Original user request
        - Outputs from completed dependencies
        - Conversation history
        - Explicit file operation instructions

        Args:
            workflow_task: Task being executed
            workflow: Parent workflow
            db: Database session

        Returns:
            Context dictionary
        """
        context = {
            "workflow_request": workflow.description,
            "task_number": workflow_task.order_index + 1,
            "total_tasks": len(workflow.workflow_tasks),
            "workspace_instructions": """
IMPORTANT: You must CREATE ACTUAL FILES in the workspace using tool calls.

Task Completion Requirements:
1. Create all necessary files using <tool_call name="write_file"> XML format
2. Include complete, working code in each file
3. Use proper file paths (e.g., "coin_flip/app.py" or "frontend/CoinFlip.tsx")
4. After creating files, confirm what you created

DO NOT just describe what files should be created. Actually create them!
"""
        }

        # Add outputs from dependencies
        if workflow_task.depends_on:
            dep_outputs = []
            for dep_id in workflow_task.depends_on:
                dep_task = db.query(WorkflowTask).filter(
                    WorkflowTask.id == UUID(dep_id)
                ).first()

                if dep_task and dep_task.output:
                    dep_outputs.append({
                        "task": dep_task.description,
                        "agent": dep_task.agent.name,
                        "output": dep_task.output.get("response")
                    })

            context["previous_task_outputs"] = dep_outputs

        return context

    def _aggregate_results(self, workflow: Workflow) -> Dict[str, Any]:
        """
        Aggregate results from all completed tasks

        Args:
            workflow: Completed workflow

        Returns:
            Results dictionary
        """
        completed_tasks = [
            t for t in workflow.workflow_tasks
            if t.status == "completed"
        ]

        duration = None
        if workflow.started_at and workflow.completed_at:
            duration = (workflow.completed_at - workflow.started_at).total_seconds()

        return {
            "summary": f"Completed {len(completed_tasks)} of {len(workflow.workflow_tasks)} tasks",
            "completed_tasks": len(completed_tasks),
            "total_tasks": len(workflow.workflow_tasks),
            "duration_seconds": duration,
            "agent_contributions": {
                task.agent.name: task.output.get("response", "")[:200]
                for task in completed_tasks
            }
        }

    async def cancel_workflow(self, workflow_id: UUID, db: Session):
        """
        Cancel a running workflow

        Args:
            workflow_id: Workflow to cancel
            db: Database session
        """
        logger.info(f"Cancelling workflow {workflow_id}")
        self.active_workflows[workflow_id] = False

        workflow = db.query(Workflow).filter(Workflow.id == workflow_id).first()
        if workflow:
            workflow.status = "cancelled"
            workflow.completed_at = datetime.now(timezone.utc)
            db.commit()
