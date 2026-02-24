/**
 * Task REST API Routes
 *
 * Fastify plugin exposing 6 endpoints for the standalone tasks table.
 * These are independent tasks (not workflow tasks -- see workflows/engine.ts).
 *
 * Endpoints:
 *   GET    /tasks                      - List tasks with optional filters
 *   POST   /tasks                      - Create a new task
 *   GET    /tasks/:taskId              - Get task by ID
 *   PATCH  /tasks/:taskId/status       - Update task status
 *   POST   /tasks/:taskId/cancel       - Cancel a task
 *   DELETE /tasks/:taskId              - Delete a task
 *
 * Python reference: backend/routers/tasks.py
 */

import { FastifyInstance } from "fastify";
import { eq, desc, and } from "drizzle-orm";
import { db } from "../db/connection.js";
import { tasks, agents } from "../db/schema.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_STATUSES = [
  "pending",
  "in_progress",
  "completed",
  "failed",
  "cancelled",
] as const;

type TaskStatus = (typeof VALID_STATUSES)[number];

const TERMINAL_STATUSES: TaskStatus[] = ["completed", "failed", "cancelled"];

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export async function taskRoutes(fastify: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // GET /tasks
  // List tasks with optional filters: status, assigned_to, limit, offset.
  // Ordered by createdAt DESC.
  // -------------------------------------------------------------------------

  fastify.get<{
    Querystring: {
      status?: string;
      assigned_to?: string;
      limit?: string;
      offset?: string;
    };
  }>("/tasks", async (request, reply) => {
    const { status, assigned_to } = request.query;
    const limit = Math.min(parseInt(request.query.limit ?? "100", 10), 500);
    const offset = parseInt(request.query.offset ?? "0", 10);

    if (isNaN(limit) || limit < 0) {
      return reply.status(400).send({ error: "limit must be a non-negative integer" });
    }
    if (isNaN(offset) || offset < 0) {
      return reply.status(400).send({ error: "offset must be a non-negative integer" });
    }

    // Validate status filter if provided
    if (status && !VALID_STATUSES.includes(status as TaskStatus)) {
      return reply.status(400).send({
        error: `Invalid status filter. Must be one of: ${VALID_STATUSES.join(", ")}`,
      });
    }

    const conditions = [];
    if (status) {
      conditions.push(eq(tasks.status, status));
    }
    if (assigned_to) {
      conditions.push(eq(tasks.assignedTo, assigned_to));
    }

    const rows =
      conditions.length > 0
        ? await db
            .select()
            .from(tasks)
            .where(and(...conditions))
            .orderBy(desc(tasks.createdAt))
            .limit(limit)
            .offset(offset)
        : await db
            .select()
            .from(tasks)
            .orderBy(desc(tasks.createdAt))
            .limit(limit)
            .offset(offset);

    return reply.send(rows);
  });

  // -------------------------------------------------------------------------
  // POST /tasks
  // Create a new task.
  // Body: { description, assigned_to?, priority?, context? }
  // Validates agent exists if assigned_to is provided.
  // -------------------------------------------------------------------------

  fastify.post<{
    Body: {
      description: string;
      assigned_to?: string;
      priority?: string;
      context?: Record<string, unknown>;
    };
  }>("/tasks", async (request, reply) => {
    const { description, assigned_to, priority, context } = request.body;

    // Validate required fields
    if (!description || typeof description !== "string" || description.trim().length === 0) {
      return reply.status(400).send({ error: "description is required and must be a non-empty string" });
    }

    // Validate priority if provided
    const validPriorities = ["low", "medium", "high"];
    if (priority && !validPriorities.includes(priority)) {
      return reply.status(400).send({
        error: `Invalid priority. Must be one of: ${validPriorities.join(", ")}`,
      });
    }

    // Validate assigned agent exists if provided
    if (assigned_to) {
      const [agent] = await db.select().from(agents).where(eq(agents.id, assigned_to));
      if (!agent) {
        return reply.status(404).send({ error: "Assigned agent not found" });
      }
    }

    const [newTask] = await db
      .insert(tasks)
      .values({
        description: description.trim(),
        assignedTo: assigned_to ?? null,
        priority: priority ?? "medium",
        context: context ?? {},
      })
      .returning();

    fastify.log.info(`Task created: ${newTask.id} (${newTask.status})`);
    return reply.status(201).send(newTask);
  });

  // -------------------------------------------------------------------------
  // GET /tasks/:taskId
  // Get a task by UUID. 404 if not found.
  // -------------------------------------------------------------------------

  fastify.get<{
    Params: { taskId: string };
  }>("/tasks/:taskId", async (request, reply) => {
    const { taskId } = request.params;

    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
    if (!task) {
      return reply.status(404).send({ error: "Task not found" });
    }

    return reply.send(task);
  });

  // -------------------------------------------------------------------------
  // PATCH /tasks/:taskId/status
  // Update task status. Sets startedAt / completedAt based on transition.
  // Body: { status: string }
  // -------------------------------------------------------------------------

  fastify.patch<{
    Params: { taskId: string };
    Body: { status: string };
  }>("/tasks/:taskId/status", async (request, reply) => {
    const { taskId } = request.params;
    const { status } = request.body;

    // Validate status value
    if (!status || !VALID_STATUSES.includes(status as TaskStatus)) {
      return reply.status(400).send({
        error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`,
      });
    }

    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
    if (!task) {
      return reply.status(404).send({ error: "Task not found" });
    }

    const now = new Date();
    const updateFields: {
      status: string;
      startedAt?: Date;
      completedAt?: Date;
    } = { status };

    // Set startedAt when transitioning to in_progress (only if not already set)
    if (status === "in_progress" && !task.startedAt) {
      updateFields.startedAt = now;
    }

    // Set completedAt when transitioning to a terminal state (only if not already set)
    if (TERMINAL_STATUSES.includes(status as TaskStatus) && !task.completedAt) {
      updateFields.completedAt = now;
    }

    const [updated] = await db
      .update(tasks)
      .set(updateFields)
      .where(eq(tasks.id, taskId))
      .returning();

    fastify.log.info(`Task ${taskId} status updated to ${status}`);
    return reply.send(updated);
  });

  // -------------------------------------------------------------------------
  // POST /tasks/:taskId/cancel
  // Cancel a task. 400 if already in a terminal state.
  // -------------------------------------------------------------------------

  fastify.post<{
    Params: { taskId: string };
  }>("/tasks/:taskId/cancel", async (request, reply) => {
    const { taskId } = request.params;

    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
    if (!task) {
      return reply.status(404).send({ error: "Task not found" });
    }

    if (TERMINAL_STATUSES.includes(task.status as TaskStatus)) {
      return reply.status(400).send({
        error: `Cannot cancel task with status: ${task.status}`,
      });
    }

    const now = new Date();
    await db
      .update(tasks)
      .set({ status: "cancelled", completedAt: now })
      .where(eq(tasks.id, taskId));

    fastify.log.info(`Task ${taskId} cancelled`);
    return reply.send({ message: "Task cancelled successfully" });
  });

  // -------------------------------------------------------------------------
  // DELETE /tasks/:taskId
  // Permanently delete a task. 404 if not found.
  // -------------------------------------------------------------------------

  fastify.delete<{
    Params: { taskId: string };
  }>("/tasks/:taskId", async (request, reply) => {
    const { taskId } = request.params;

    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
    if (!task) {
      return reply.status(404).send({ error: "Task not found" });
    }

    await db.delete(tasks).where(eq(tasks.id, taskId));

    fastify.log.info(`Task ${taskId} deleted`);
    return reply.send({ message: "Task deleted successfully" });
  });
}
