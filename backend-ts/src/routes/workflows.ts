/**
 * Workflow REST API Routes
 *
 * 9 endpoints for workflow lifecycle management:
 *   POST   /workflows/plan               - Create workflow from user request (orchestrator plans tasks)
 *   POST   /workflows                    - Create workflow manually
 *   GET    /workflows                    - List workflows with optional filters
 *   GET    /workflows/:workflowId        - Get workflow by ID (Redis cached, 60s TTL)
 *   POST   /workflows/:workflowId/start  - Start workflow execution (fire-and-forget background)
 *   POST   /workflows/:workflowId/cancel - Cancel running workflow
 *   DELETE /workflows/:workflowId        - Delete workflow (not while executing)
 *   GET    /workflows/:workflowId/tasks  - List workflow tasks with optional status filter
 *   GET    /workflows/:workflowId/tasks/:taskId - Get a specific workflow task
 *
 * Ports /backend/routers/workflows.py to TypeScript/Fastify.
 */

import { FastifyInstance } from "fastify";
import { eq, and, desc } from "drizzle-orm";
import { db, redis } from "../db/connection.js";
import { workflows, workflowTasks, agents } from "../db/schema.js";
import { workflowEngine } from "../workflows/engine.js";

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

const WORKFLOW_CACHE_TTL_SECONDS = 60;

function workflowCacheKey(workflowId: string): string {
  return `workflows:${workflowId}`;
}

async function invalidateWorkflowCache(workflowId: string): Promise<void> {
  await redis.del(workflowCacheKey(workflowId));
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export async function workflowRoutes(fastify: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // POST /workflows/plan
  // Create a workflow from a user request — orchestrator plans the tasks.
  // -------------------------------------------------------------------------

  fastify.post<{
    Body: { user_request: string; channel_id?: string };
  }>("/workflows/plan", async (request, reply) => {
    const { user_request, channel_id } = request.body;

    if (!user_request || typeof user_request !== "string" || user_request.trim() === "") {
      return reply.status(400).send({ error: "user_request is required" });
    }

    // Find the active orchestrator agent
    const [orchestrator] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.agentType, "orchestrator"), eq(agents.isActive, true)))
      .limit(1);

    if (!orchestrator) {
      return reply.status(500).send({
        error: "Orchestrator agent not found or inactive",
      });
    }

    try {
      // createWorkflowFromRequest returns the workflow ID
      const workflowId = await workflowEngine.createWorkflowFromRequest(
        user_request.trim(),
        orchestrator.id,
        channel_id ?? "",
      );

      // Fetch the created workflow to return the full record
      const [workflow] = await db
        .select()
        .from(workflows)
        .where(eq(workflows.id, workflowId));

      if (!workflow) {
        return reply.status(500).send({ error: "Failed to retrieve created workflow" });
      }

      return reply.status(201).send(workflow);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fastify.log.error({ err, user_request }, "Failed to create workflow from plan request");
      return reply.status(500).send({ error: message });
    }
  });

  // -------------------------------------------------------------------------
  // POST /workflows
  // Create a workflow manually (no orchestrator planning).
  // -------------------------------------------------------------------------

  fastify.post<{
    Body: {
      description: string;
      orchestrator_id: string;
      channel_id?: string;
      execution_strategy?: string;
    };
  }>("/workflows", async (request, reply) => {
    const { description, orchestrator_id, channel_id, execution_strategy } = request.body;

    if (!description || typeof description !== "string" || description.trim() === "") {
      return reply.status(400).send({ error: "description is required" });
    }
    if (!orchestrator_id || typeof orchestrator_id !== "string") {
      return reply.status(400).send({ error: "orchestrator_id is required" });
    }

    // Validate orchestrator exists
    const [orchestrator] = await db
      .select()
      .from(agents)
      .where(eq(agents.id, orchestrator_id))
      .limit(1);

    if (!orchestrator) {
      return reply.status(404).send({ error: "Orchestrator not found" });
    }

    const validStrategies = ["sequential", "parallel", "dag"];
    const strategy =
      execution_strategy && validStrategies.includes(execution_strategy)
        ? execution_strategy
        : "sequential";

    const [workflow] = await db
      .insert(workflows)
      .values({
        description: description.trim(),
        orchestratorId: orchestrator_id,
        channelId: channel_id ?? null,
        status: "pending",
        executionStrategy: strategy,
      })
      .returning();

    if (!workflow) {
      return reply.status(500).send({ error: "Failed to create workflow" });
    }

    return reply.status(201).send(workflow);
  });

  // -------------------------------------------------------------------------
  // GET /workflows
  // List workflows with optional filters.
  // -------------------------------------------------------------------------

  fastify.get<{
    Querystring: {
      status?: string;
      channel_id?: string;
      limit?: string;
      offset?: string;
    };
  }>("/workflows", async (request, reply) => {
    const { status, channel_id } = request.query;
    const limit = Math.min(parseInt(request.query.limit ?? "50", 10) || 50, 200);
    const offset = parseInt(request.query.offset ?? "0", 10) || 0;

    // Build filter conditions
    const conditions = [];
    if (status) {
      conditions.push(eq(workflows.status, status));
    }
    if (channel_id) {
      conditions.push(eq(workflows.channelId, channel_id));
    }

    const rows =
      conditions.length > 0
        ? await db
            .select()
            .from(workflows)
            .where(and(...conditions))
            .orderBy(desc(workflows.createdAt))
            .limit(limit)
            .offset(offset)
        : await db
            .select()
            .from(workflows)
            .orderBy(desc(workflows.createdAt))
            .limit(limit)
            .offset(offset);

    return reply.send(rows);
  });

  // -------------------------------------------------------------------------
  // GET /workflows/:workflowId
  // Get workflow by ID — Redis cached with 60s TTL.
  // -------------------------------------------------------------------------

  fastify.get<{ Params: { workflowId: string } }>(
    "/workflows/:workflowId",
    async (request, reply) => {
      const { workflowId } = request.params;

      // Try Redis cache first
      const cacheKey = workflowCacheKey(workflowId);
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return reply.send(JSON.parse(cached) as unknown);
        }
      } catch (err) {
        // Cache read failure is non-fatal — fall through to DB
        fastify.log.warn({ err, workflowId }, "Redis cache read failed for workflow");
      }

      // Cache miss — query database
      const [workflow] = await db
        .select()
        .from(workflows)
        .where(eq(workflows.id, workflowId));

      if (!workflow) {
        return reply.status(404).send({ error: "Workflow not found" });
      }

      // Populate cache (non-blocking)
      redis
        .set(cacheKey, JSON.stringify(workflow), "EX", WORKFLOW_CACHE_TTL_SECONDS)
        .catch((err) => {
          fastify.log.warn({ err, workflowId }, "Redis cache write failed for workflow");
        });

      return reply.send(workflow);
    },
  );

  // -------------------------------------------------------------------------
  // POST /workflows/:workflowId/start
  // Start workflow execution — fires in background, returns immediately.
  // -------------------------------------------------------------------------

  fastify.post<{ Params: { workflowId: string } }>(
    "/workflows/:workflowId/start",
    async (request, reply) => {
      const { workflowId } = request.params;

      const [workflow] = await db
        .select()
        .from(workflows)
        .where(eq(workflows.id, workflowId));

      if (!workflow) {
        return reply.status(404).send({ error: "Workflow not found" });
      }

      if (workflow.status !== "planning" && workflow.status !== "failed") {
        return reply.status(400).send({
          error: `Workflow cannot be started (status: ${workflow.status})`,
        });
      }

      // Invalidate cache — status is about to change
      await invalidateWorkflowCache(workflowId);

      // Fire-and-forget: do not await so the HTTP response returns immediately.
      // Progress is delivered via WebSocket events (workflow:started, workflow:progress, etc.).
      workflowEngine.executeWorkflow(workflowId).catch((err) => {
        fastify.log.error({ err, workflowId }, "Background workflow execution failed");
      });

      return reply.send({
        message: "Workflow execution started",
        workflow_id: workflowId,
        status: "executing",
      });
    },
  );

  // -------------------------------------------------------------------------
  // POST /workflows/:workflowId/cancel
  // Cancel a running workflow.
  // -------------------------------------------------------------------------

  fastify.post<{ Params: { workflowId: string } }>(
    "/workflows/:workflowId/cancel",
    async (request, reply) => {
      const { workflowId } = request.params;

      const [workflow] = await db
        .select()
        .from(workflows)
        .where(eq(workflows.id, workflowId));

      if (!workflow) {
        return reply.status(404).send({ error: "Workflow not found" });
      }

      if (workflow.status !== "executing") {
        return reply.status(400).send({
          error: `Cannot cancel workflow with status: ${workflow.status}`,
        });
      }

      await workflowEngine.cancelWorkflow(workflowId);

      // Invalidate cache — status changed to cancelled
      await invalidateWorkflowCache(workflowId);

      return reply.send({ message: "Workflow cancelled successfully" });
    },
  );

  // -------------------------------------------------------------------------
  // DELETE /workflows/:workflowId
  // Delete a workflow and all its tasks (CASCADE in schema handles tasks).
  // -------------------------------------------------------------------------

  fastify.delete<{ Params: { workflowId: string } }>(
    "/workflows/:workflowId",
    async (request, reply) => {
      const { workflowId } = request.params;

      const [workflow] = await db
        .select()
        .from(workflows)
        .where(eq(workflows.id, workflowId));

      if (!workflow) {
        return reply.status(404).send({ error: "Workflow not found" });
      }

      if (workflow.status === "executing") {
        return reply.status(400).send({
          error: "Cannot delete workflow while executing. Cancel it first.",
        });
      }

      await db.delete(workflows).where(eq(workflows.id, workflowId));

      // Invalidate cache
      await invalidateWorkflowCache(workflowId);

      return reply.send({ message: "Workflow deleted successfully" });
    },
  );

  // -------------------------------------------------------------------------
  // GET /workflows/:workflowId/tasks
  // List all tasks for a workflow with optional status filter.
  // -------------------------------------------------------------------------

  fastify.get<{
    Params: { workflowId: string };
    Querystring: { status?: string };
  }>("/workflows/:workflowId/tasks", async (request, reply) => {
    const { workflowId } = request.params;
    const { status } = request.query;

    // Verify the workflow exists
    const [workflow] = await db
      .select()
      .from(workflows)
      .where(eq(workflows.id, workflowId));

    if (!workflow) {
      return reply.status(404).send({ error: "Workflow not found" });
    }

    const tasks = status
      ? await db
          .select()
          .from(workflowTasks)
          .where(
            and(
              eq(workflowTasks.workflowId, workflowId),
              eq(workflowTasks.status, status),
            ),
          )
          .orderBy(workflowTasks.orderIndex)
      : await db
          .select()
          .from(workflowTasks)
          .where(eq(workflowTasks.workflowId, workflowId))
          .orderBy(workflowTasks.orderIndex);

    return reply.send(tasks);
  });

  // -------------------------------------------------------------------------
  // GET /workflows/:workflowId/tasks/:taskId
  // Get a specific workflow task — verifies it belongs to the workflow.
  // -------------------------------------------------------------------------

  fastify.get<{
    Params: { workflowId: string; taskId: string };
  }>("/workflows/:workflowId/tasks/:taskId", async (request, reply) => {
    const { workflowId, taskId } = request.params;

    const [task] = await db
      .select()
      .from(workflowTasks)
      .where(
        and(
          eq(workflowTasks.id, taskId),
          eq(workflowTasks.workflowId, workflowId),
        ),
      );

    if (!task) {
      return reply.status(404).send({ error: "Task not found" });
    }

    return reply.send(task);
  });
}
