/**
 * Workflow Orchestration Engine
 *
 * Manages multi-agent workflow execution with dependency tracking,
 * parallel/DAG execution, and real-time WebSocket progress updates.
 *
 * Replaces backend/agents/workflow_orchestrator.py (743 LOC).
 *
 * Lifecycle:
 *   1. createWorkflowFromRequest() — invoke orchestrator to plan tasks
 *   2. executeWorkflow() — run tasks in DAG order (parallel where possible)
 *   3. cancelWorkflow() — stop a running workflow
 *
 * DAG execution loop:
 *   while (incomplete tasks remain) {
 *     ready = tasks whose dependencies are all completed
 *     results = await Promise.all(ready.map(executeTask))
 *     update completed/failed, broadcast progress
 *   }
 */

import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import {
  workflows,
  workflowTasks,
  agents,
  messages,
} from "../db/schema.js";
import { wsManager } from "../websocket/manager.js";
import { parsePlanText, determineExecutionStrategy, buildPlanningPrompt } from "./parser.js";
import type {
  WorkflowStatus,
  TaskStatus,
  WorkflowResults,
  TaskExecutionResult,
} from "./types.js";
import { RezNetAgent, type ProcessMessageContext } from "../agents/base-agent.js";
import { createSpecialistAgent } from "../agents/specialists.js";
import { resolveModel } from "../llm/client.js";
import type { AgentName } from "../agents/tools/delegation.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WORKSPACE_INSTRUCTIONS = `
IMPORTANT: You must CREATE ACTUAL FILES in the workspace using tool calls.

Task Completion Requirements:
1. Create all necessary files using the write_file tool
2. Include complete, working code in each file
3. Use proper file paths (e.g., "coin_flip/app.py" or "frontend/CoinFlip.tsx")
4. After creating files, confirm what you created

DO NOT just describe what files should be created. Actually create them!
`;

// ---------------------------------------------------------------------------
// WorkflowEngine
// ---------------------------------------------------------------------------

export class WorkflowEngine {
  /** Track running workflows for cancellation. */
  private activeWorkflows = new Map<string, boolean>();

  /**
   * Create a workflow from a user request.
   *
   * Steps:
   *   1. Create workflow record (status: planning)
   *   2. Invoke orchestrator to generate plan
   *   3. Parse plan text into tasks
   *   4. Create WorkflowTask records with dependency UUIDs
   *   5. Broadcast plan_ready event
   *
   * @param userRequest - Original user request
   * @param orchestratorId - UUID of the orchestrator agent
   * @param channelId - Channel where request was made
   * @returns Created workflow ID
   */
  async createWorkflowFromRequest(
    userRequest: string,
    orchestratorId: string,
    channelId: string,
  ): Promise<string> {
    // 1. Create workflow record
    const workflowRows = await db
      .insert(workflows)
      .values({
        id: randomUUID(),
        description: userRequest,
        orchestratorId,
        channelId,
        status: "planning" as WorkflowStatus,
      })
      .returning();

    const workflow = workflowRows[0];
    if (!workflow) throw new Error("Failed to create workflow");

    // Broadcast workflow:created
    wsManager.broadcast("workflow:created", {
      workflow_id: workflow.id,
      description: workflow.description,
    });

    try {
      // 2. Get orchestrator agent
      const orchestratorRows = await db
        .select()
        .from(agents)
        .where(eq(agents.id, orchestratorId))
        .limit(1);

      const orchestratorRecord = orchestratorRows[0];
      if (!orchestratorRecord) {
        throw new Error("Orchestrator agent not found");
      }

      // Broadcast workflow:planning
      wsManager.broadcast("workflow:planning", {
        workflow_id: workflow.id,
        orchestrator: orchestratorRecord.name,
      });

      // Create orchestrator agent instance
      const orchestrator = createSpecialistAgent({
        agentId: orchestratorRecord.id,
        agentType: "orchestrator",
        model: resolveModel(),
      });

      // 3. Get plan from orchestrator
      const planningPrompt = buildPlanningPrompt(userRequest);
      const planResponse = await orchestrator.processMessage(planningPrompt);

      // 4. Parse plan
      const parsedTasks = parsePlanText(planResponse);

      if (parsedTasks.length === 0) {
        throw new Error("Orchestrator did not create a valid plan");
      }

      // Determine execution strategy
      const strategy = determineExecutionStrategy(parsedTasks);
      await db
        .update(workflows)
        .set({ executionStrategy: strategy })
        .where(eq(workflows.id, workflow.id));

      // 5. Create WorkflowTask records
      // First pass: create all tasks (without dependency UUIDs)
      const taskMap = new Map<number, string>(); // taskNumber -> task UUID
      const createdTasks: Array<{
        id: string;
        description: string;
        agentName: string;
        orderIndex: number;
        dependsOnNumbers: number[];
      }> = [];

      for (const parsed of parsedTasks) {
        // Look up agent by name
        const agentRows = await db
          .select()
          .from(agents)
          .where(eq(agents.name, `@${parsed.agentName}`))
          .limit(1);

        const agentRecord = agentRows[0];
        if (!agentRecord) {
          console.warn(
            `[workflow] Agent @${parsed.agentName} not found, skipping task`,
          );
          continue;
        }

        const taskId = randomUUID();
        await db.insert(workflowTasks).values({
          id: taskId,
          workflowId: workflow.id,
          description: parsed.description,
          agentId: agentRecord.id,
          orderIndex: parsed.taskNumber - 1,
          dependsOn: [], // Updated in second pass
          status: "pending" as TaskStatus,
        });

        taskMap.set(parsed.taskNumber, taskId);
        createdTasks.push({
          id: taskId,
          description: parsed.description,
          agentName: parsed.agentName,
          orderIndex: parsed.taskNumber - 1,
          dependsOnNumbers: parsed.dependsOnNumbers,
        });
      }

      // Second pass: update dependencies with actual UUIDs
      for (const task of createdTasks) {
        if (task.dependsOnNumbers.length > 0) {
          const depUuids: string[] = [];
          for (const depNum of task.dependsOnNumbers) {
            const depId = taskMap.get(depNum);
            if (depId) depUuids.push(depId);
          }
          if (depUuids.length > 0) {
            await db
              .update(workflowTasks)
              .set({ dependsOn: depUuids })
              .where(eq(workflowTasks.id, task.id));
          }
        }
      }

      // 6. Broadcast plan_ready
      wsManager.broadcast("workflow:plan_ready", {
        workflow_id: workflow.id,
        plan: {
          total_tasks: createdTasks.length,
          tasks: createdTasks.map((t) => ({
            id: t.id,
            description: t.description,
            agent: `@${t.agentName}`,
            order: t.orderIndex,
            depends_on: t.dependsOnNumbers.map(
              (n) => taskMap.get(n) ?? `unknown-${n}`,
            ),
          })),
        },
      });

      return workflow.id;
    } catch (err) {
      // Mark workflow as failed
      await db
        .update(workflows)
        .set({
          status: "failed" as WorkflowStatus,
        })
        .where(eq(workflows.id, workflow.id));

      throw err;
    }
  }

  /**
   * Execute a workflow — run tasks in dependency order.
   *
   * DAG execution loop:
   *   1. Find tasks with status=pending and all deps completed
   *   2. Execute ready tasks in parallel via Promise.allSettled
   *   3. Update task statuses, broadcast progress
   *   4. Repeat until all complete or failure/cancellation
   */
  async executeWorkflow(workflowId: string): Promise<void> {
    this.activeWorkflows.set(workflowId, true);

    // Load workflow
    const workflowRows = await db
      .select()
      .from(workflows)
      .where(eq(workflows.id, workflowId))
      .limit(1);

    const workflow = workflowRows[0];
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    // Update status to executing
    await db
      .update(workflows)
      .set({
        status: "executing" as WorkflowStatus,
        startedAt: new Date(),
      })
      .where(eq(workflows.id, workflowId));

    // Load all tasks
    const allTasks = await db
      .select()
      .from(workflowTasks)
      .where(eq(workflowTasks.workflowId, workflowId));

    const totalTasks = allTasks.length;

    // Broadcast workflow:started
    wsManager.broadcast("workflow:started", {
      workflow_id: workflowId,
      total_tasks: totalTasks,
    });

    try {
      let completedCount = 0;
      let failed = false;
      let errorMessage = "";

      while (completedCount < totalTasks && !failed) {
        // Check cancellation
        if (!this.activeWorkflows.get(workflowId)) {
          await db
            .update(workflows)
            .set({
              status: "cancelled" as WorkflowStatus,
              completedAt: new Date(),
            })
            .where(eq(workflows.id, workflowId));

          wsManager.broadcast("workflow:cancelled", {
            workflow_id: workflowId,
          });
          return;
        }

        // Reload current task statuses
        const currentTasks = await db
          .select()
          .from(workflowTasks)
          .where(eq(workflowTasks.workflowId, workflowId));

        // Find ready tasks
        const readyTasks = this.getReadyTasks(currentTasks);

        if (readyTasks.length === 0) {
          // No more ready tasks but not all completed = deadlock
          errorMessage = "Task dependency deadlock detected";
          failed = true;
          break;
        }

        // Execute ready tasks in parallel
        const results = await Promise.allSettled(
          readyTasks.map((task) =>
            this.executeTask(task, workflow.description),
          ),
        );

        // Process results
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const task = readyTasks[i];

          if (result.status === "rejected") {
            const err = result.reason;
            const errMsg =
              err instanceof Error ? err.message : String(err);

            await db
              .update(workflowTasks)
              .set({
                status: "failed" as TaskStatus,
                error: errMsg,
                completedAt: new Date(),
              })
              .where(eq(workflowTasks.id, task.id));

            wsManager.broadcast("workflow:task_failed", {
              workflow_id: workflowId,
              task_id: task.id,
              error: errMsg,
            });

            failed = true;
            errorMessage = `Task failed: ${errMsg}`;
          } else {
            completedCount++;

            // Broadcast progress
            const percent = Math.round(
              (completedCount / totalTasks) * 100,
            );
            wsManager.broadcast("workflow:progress", {
              workflow_id: workflowId,
              completed: completedCount,
              total: totalTasks,
              percent,
            });
          }
        }
      }

      // Finalize workflow
      if (failed) {
        await db
          .update(workflows)
          .set({
            status: "failed" as WorkflowStatus,
            completedAt: new Date(),
          })
          .where(eq(workflows.id, workflowId));

        wsManager.broadcast("workflow:failed", {
          workflow_id: workflowId,
          error: errorMessage,
        });

        // Post failure message to channel
        if (workflow.channelId) {
          await this.postWorkflowMessage(
            workflow.channelId,
            workflow.orchestratorId,
            `Workflow failed: ${errorMessage}`,
            { workflow_id: workflowId, error: true },
          );
        }
      } else {
        const completedAt = new Date();

        await db
          .update(workflows)
          .set({
            status: "completed" as WorkflowStatus,
            completedAt,
          })
          .where(eq(workflows.id, workflowId));

        // Aggregate results
        const results = await this.aggregateResults(
          workflowId,
          workflow.startedAt ?? workflow.createdAt,
          completedAt,
        );

        wsManager.broadcast("workflow:completed", {
          workflow_id: workflowId,
          results,
        });

        // Post completion message to channel
        if (workflow.channelId) {
          const summaryParts = [
            `Workflow completed successfully! (${results.completedTasks}/${results.totalTasks} tasks)`,
          ];

          if (results.durationSeconds !== null) {
            summaryParts.push(
              `\nDuration: ${results.durationSeconds.toFixed(1)}s`,
            );
          }

          summaryParts.push("\n\n**Agent Contributions:**");
          for (const [agentName, output] of Object.entries(
            results.agentContributions,
          )) {
            summaryParts.push(
              `\n- ${agentName}: ${output.slice(0, 150)}...`,
            );
          }

          await this.postWorkflowMessage(
            workflow.channelId,
            workflow.orchestratorId,
            summaryParts.join(""),
            { workflow_id: workflowId, results },
          );
        }
      }
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message : String(err);

      await db
        .update(workflows)
        .set({
          status: "failed" as WorkflowStatus,
          completedAt: new Date(),
        })
        .where(eq(workflows.id, workflowId));

      wsManager.broadcast("workflow:failed", {
        workflow_id: workflowId,
        error: errMsg,
      });

      // Post error message
      if (workflow.channelId) {
        await this.postWorkflowMessage(
          workflow.channelId,
          workflow.orchestratorId,
          `Workflow execution error: ${errMsg}`,
          { workflow_id: workflowId, error: true },
        );
      }
    } finally {
      this.activeWorkflows.delete(workflowId);
    }
  }

  /**
   * Cancel a running workflow.
   */
  async cancelWorkflow(workflowId: string): Promise<void> {
    this.activeWorkflows.set(workflowId, false);

    await db
      .update(workflows)
      .set({
        status: "cancelled" as WorkflowStatus,
        completedAt: new Date(),
      })
      .where(eq(workflows.id, workflowId));

    wsManager.broadcast("workflow:cancelled", {
      workflow_id: workflowId,
    });
  }

  /**
   * Check whether a workflow is currently active.
   */
  isActive(workflowId: string): boolean {
    return this.activeWorkflows.get(workflowId) === true;
  }

  // ---------------------------------------------------------------------------
  // Private: DAG resolution
  // ---------------------------------------------------------------------------

  /**
   * Find tasks that are ready to execute:
   * status=pending AND all dependencies completed.
   */
  private getReadyTasks<
    T extends { id: string; status: string | null; dependsOn: unknown },
  >(tasks: T[]): T[] {
    // Build a set of completed task IDs
    const completedIds = new Set(
      tasks
        .filter((t) => t.status === "completed")
        .map((t) => t.id),
    );

    return tasks.filter((task) => {
      if (task.status !== "pending") return false;

      const deps = (task.dependsOn ?? []) as string[];
      if (deps.length === 0) return true;

      return deps.every((depId) => completedIds.has(depId));
    });
  }

  // ---------------------------------------------------------------------------
  // Private: Task execution
  // ---------------------------------------------------------------------------

  /**
   * Execute a single workflow task.
   */
  private async executeTask(
    task: {
      id: string;
      description: string;
      agentId: string;
      workflowId: string;
      dependsOn: unknown;
    },
    workflowDescription: string,
  ): Promise<TaskExecutionResult> {
    // Mark task as in_progress
    await db
      .update(workflowTasks)
      .set({
        status: "in_progress" as TaskStatus,
        startedAt: new Date(),
      })
      .where(eq(workflowTasks.id, task.id));

    // Look up agent record
    const agentRows = await db
      .select()
      .from(agents)
      .where(eq(agents.id, task.agentId))
      .limit(1);

    const agentRecord = agentRows[0];
    if (!agentRecord) {
      throw new Error(`Agent ${task.agentId} not found`);
    }

    // Broadcast task_started
    wsManager.broadcast("workflow:task_started", {
      workflow_id: task.workflowId,
      task_id: task.id,
      agent: agentRecord.name,
      description: task.description,
    });

    try {
      // Build context
      const context = await this.buildTaskContext(
        task,
        workflowDescription,
      );

      // Create agent instance
      const agentType = agentRecord.agentType as AgentName;
      const isKnown = [
        "orchestrator",
        "backend",
        "frontend",
        "qa",
        "devops",
      ].includes(agentType);

      let agent: RezNetAgent;
      if (isKnown) {
        agent = createSpecialistAgent({
          agentId: agentRecord.id,
          agentType,
          model: resolveModel(),
        });
      } else {
        agent = new RezNetAgent({
          agentId: agentRecord.id,
          name: agentRecord.agentType,
          agentType: agentRecord.agentType,
          persona: (agentRecord.persona as {
            role: string;
            goal: string;
            backstory: string;
            capabilities: string[];
            color: string;
          }) ?? {
            role: `a ${agentRecord.agentType} specialist`,
            goal: "Help with tasks related to your expertise.",
            backstory: "You are a specialist agent.",
            capabilities: ["General assistance"],
            color: "#888888",
          },
          model: resolveModel(),
        });
      }

      // Execute task
      const response = await agent.processMessage(
        task.description,
        context,
      );

      // Update task with result
      const output: TaskExecutionResult = {
        taskId: task.id,
        agentName: agentRecord.name,
        response,
      };

      await db
        .update(workflowTasks)
        .set({
          status: "completed" as TaskStatus,
          output: { response, agent: agentRecord.name },
          completedAt: new Date(),
        })
        .where(eq(workflowTasks.id, task.id));

      // Broadcast task_completed
      wsManager.broadcast("workflow:task_completed", {
        workflow_id: task.workflowId,
        task_id: task.id,
        output: { response, agent: agentRecord.name },
      });

      return output;
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message : String(err);

      await db
        .update(workflowTasks)
        .set({
          status: "failed" as TaskStatus,
          error: errMsg,
          completedAt: new Date(),
        })
        .where(eq(workflowTasks.id, task.id));

      wsManager.broadcast("workflow:task_failed", {
        workflow_id: task.workflowId,
        task_id: task.id,
        error: errMsg,
      });

      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Private: Context builder
  // ---------------------------------------------------------------------------

  /**
   * Build context for a workflow task execution.
   *
   * Includes original workflow request and outputs from completed dependencies.
   */
  private async buildTaskContext(
    task: {
      id: string;
      workflowId: string;
      dependsOn: unknown;
    },
    workflowDescription: string,
  ): Promise<ProcessMessageContext> {
    const context: ProcessMessageContext = {
      workflowRequest: workflowDescription,
      workspaceInstructions: WORKSPACE_INSTRUCTIONS,
    };

    // Add outputs from completed dependencies
    const deps = (task.dependsOn ?? []) as string[];
    if (deps.length > 0) {
      const depOutputs: Array<{ agent: string; output: string }> = [];

      for (const depId of deps) {
        const depRows = await db
          .select()
          .from(workflowTasks)
          .where(eq(workflowTasks.id, depId))
          .limit(1);

        const depTask = depRows[0];
        if (depTask?.output) {
          const output = depTask.output as {
            response?: string;
            agent?: string;
          };
          depOutputs.push({
            agent: output.agent ?? "unknown",
            output: output.response ?? "",
          });
        }
      }

      if (depOutputs.length > 0) {
        context.previousTaskOutputs = depOutputs;
      }
    }

    return context;
  }

  // ---------------------------------------------------------------------------
  // Private: Result aggregation
  // ---------------------------------------------------------------------------

  /**
   * Aggregate results from all completed tasks.
   */
  private async aggregateResults(
    workflowId: string,
    startedAt: Date | null,
    completedAt: Date,
  ): Promise<WorkflowResults> {
    const allTasks = await db
      .select({
        id: workflowTasks.id,
        status: workflowTasks.status,
        output: workflowTasks.output,
        agentId: workflowTasks.agentId,
      })
      .from(workflowTasks)
      .where(eq(workflowTasks.workflowId, workflowId));

    const completedTasks = allTasks.filter(
      (t) => t.status === "completed",
    );

    let durationSeconds: number | null = null;
    if (startedAt) {
      durationSeconds =
        (completedAt.getTime() - startedAt.getTime()) / 1000;
    }

    // Build agent contributions
    const agentContributions: Record<string, string> = {};
    for (const task of completedTasks) {
      const output = task.output as {
        response?: string;
        agent?: string;
      } | null;
      if (output?.agent && output?.response) {
        agentContributions[output.agent] = output.response.slice(
          0,
          200,
        );
      }
    }

    return {
      summary: `Completed ${completedTasks.length} of ${allTasks.length} tasks`,
      completedTasks: completedTasks.length,
      totalTasks: allTasks.length,
      durationSeconds,
      agentContributions,
    };
  }

  // ---------------------------------------------------------------------------
  // Private: Channel messaging
  // ---------------------------------------------------------------------------

  /**
   * Post a workflow status message to the channel.
   */
  private async postWorkflowMessage(
    channelId: string,
    orchestratorId: string,
    content: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const msgRows = await db
      .insert(messages)
      .values({
        id: randomUUID(),
        channelId,
        authorId: orchestratorId,
        authorType: "agent",
        authorName: "@orchestrator",
        content,
        msgMetadata: metadata,
      })
      .returning();

    const msg = msgRows[0];
    if (msg) {
      wsManager.broadcast("message_new", {
        id: msg.id,
        channel_id: msg.channelId,
        author_type: msg.authorType,
        author_name: msg.authorName,
        content: msg.content,
        created_at: msg.createdAt?.toISOString() ?? new Date().toISOString(),
        metadata: msg.msgMetadata ?? {},
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const workflowEngine = new WorkflowEngine();
