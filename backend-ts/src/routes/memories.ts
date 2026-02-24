/**
 * Agent Semantic Memory REST API Routes
 *
 * Fastify plugin exposing 6 endpoints for agent long-term memory management.
 * Delegates to SemanticMemoryManager (src/memory/manager.ts) for all
 * pgvector-based operations — no raw SQL here.
 *
 * Endpoints:
 *   GET    /agents/:agentId/memory/stats      - Memory statistics
 *   POST   /agents/:agentId/memory/search     - Semantic similarity search
 *   GET    /agents/:agentId/memory/recent     - Most recent memories
 *   POST   /agents/:agentId/memory/summarize  - Latest summary memory
 *   DELETE /agents/:agentId/memory/cleanup    - Delete old low-importance memories
 *   GET    /memory/health                     - Memory system health check
 *
 * Route registration order matters:
 *   /memory/health must be registered BEFORE /:agentId routes so Fastify's
 *   radix-tree router resolves the static segment before any wildcard.
 *
 * Python reference: backend/routers/memories.py
 */

import { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../db/connection.js";
import { agents, agentMemories } from "../db/schema.js";
import { SemanticMemoryManager } from "../memory/manager.js";

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export async function memoryRoutes(fastify: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // GET /memory/health
  // Registered FIRST (before agent-scoped routes) so the static path segment
  // "memory" takes precedence over the ":agentId" wildcard.
  //
  // Checks: pgvector extension present, total memory count, counts by type.
  // -------------------------------------------------------------------------

  fastify.get("/memory/health", async (_request, reply) => {
    try {
      // Check pgvector extension via raw pool query (avoids ORM schema assumption)
      const pgvectorResult = await pool.query<{ exists: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector') AS exists",
      );
      const pgvectorEnabled = pgvectorResult.rows[0]?.exists ?? false;

      // Total memory count
      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(agentMemories);
      const totalMemories = Number(countResult[0]?.count ?? 0);

      // Count by memory type
      const typeResults = await db
        .select({
          memoryType: agentMemories.memoryType,
          count: sql<number>`count(*)`,
        })
        .from(agentMemories)
        .groupBy(agentMemories.memoryType);

      const memoryTypes: Record<string, number> = {};
      for (const row of typeResults) {
        memoryTypes[row.memoryType ?? "unknown"] = Number(row.count);
      }

      return reply.send({
        status: pgvectorEnabled ? "healthy" : "degraded",
        pgvector_enabled: pgvectorEnabled,
        total_memories: totalMemories,
        memory_types: memoryTypes,
        message: pgvectorEnabled
          ? "Semantic memory system operational"
          : "pgvector extension not enabled — semantic search unavailable",
      });
    } catch (err) {
      fastify.log.error({ err }, "Memory health check failed");
      return reply.send({
        status: "unhealthy",
        pgvector_enabled: false,
        total_memories: 0,
        memory_types: {},
        message: "Failed to check memory system health",
      });
    }
  });

  // -------------------------------------------------------------------------
  // Helper: look up an agent record, return null if not found.
  // All agent-scoped routes call this and send 404 when it returns null.
  // -------------------------------------------------------------------------

  async function findAgent(agentId: string) {
    const [agent] = await db.select().from(agents).where(eq(agents.id, agentId));
    return agent ?? null;
  }

  // -------------------------------------------------------------------------
  // GET /agents/:agentId/memory/stats
  // Memory statistics for a specific agent.
  // Query: channel_id? — scopes stats to a single channel.
  // -------------------------------------------------------------------------

  fastify.get<{
    Params: { agentId: string };
    Querystring: { channel_id?: string };
  }>("/agents/:agentId/memory/stats", async (request, reply) => {
    const { agentId } = request.params;
    const { channel_id } = request.query;

    const agent = await findAgent(agentId);
    if (!agent) {
      return reply.status(404).send({ error: `Agent not found: ${agentId}` });
    }

    try {
      const manager = new SemanticMemoryManager(agentId);
      const stats = await manager.getStats(channel_id);

      return reply.send({
        enabled: true,
        agent_name: agent.name,
        ...stats,
      });
    } catch (err) {
      fastify.log.error({ err, agentId }, "Error fetching memory stats");
      return reply.status(500).send({ error: "Failed to retrieve memory statistics" });
    }
  });

  // -------------------------------------------------------------------------
  // POST /agents/:agentId/memory/search
  // Semantic similarity search over an agent's memories.
  // Query params: query (required), limit=5, memory_types?, channel_id?,
  //               min_importance=3
  // Returns: array of MemoryRecord (from manager.ts)
  // -------------------------------------------------------------------------

  fastify.post<{
    Params: { agentId: string };
    Querystring: {
      query: string;
      limit?: string;
      memory_types?: string;
      channel_id?: string;
      min_importance?: string;
    };
  }>("/agents/:agentId/memory/search", async (request, reply) => {
    const { agentId } = request.params;
    const {
      query,
      limit: limitStr,
      memory_types,
      channel_id,
      min_importance: minImportanceStr,
    } = request.query;

    if (!query || query.trim().length === 0) {
      return reply.status(400).send({ error: "query parameter is required" });
    }

    const limit = parseInt(limitStr ?? "5", 10);
    if (isNaN(limit) || limit < 1 || limit > 50) {
      return reply.status(400).send({ error: "limit must be between 1 and 50" });
    }

    const minImportance = parseInt(minImportanceStr ?? "3", 10);
    if (isNaN(minImportance) || minImportance < 1 || minImportance > 10) {
      return reply.status(400).send({ error: "min_importance must be between 1 and 10" });
    }

    const agent = await findAgent(agentId);
    if (!agent) {
      return reply.status(404).send({ error: `Agent not found: ${agentId}` });
    }

    // Parse comma-separated memory_types into an array of MemoryType strings
    const memoryTypesArr = memory_types
      ? memory_types
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined;

    try {
      const manager = new SemanticMemoryManager(agentId);
      const memories = await manager.retrieveRelevant({
        query: query.trim(),
        limit,
        memoryTypes: memoryTypesArr as Parameters<SemanticMemoryManager["retrieveRelevant"]>[0]["memoryTypes"],
        channelId: channel_id,
        minImportance,
      });

      return reply.send(memories);
    } catch (err) {
      fastify.log.error({ err, agentId }, "Error searching memories");
      return reply.status(500).send({ error: "Failed to search memories" });
    }
  });

  // -------------------------------------------------------------------------
  // GET /agents/:agentId/memory/recent
  // Most recent memories for an agent in chronological order.
  // Query: limit=10, channel_id?
  // -------------------------------------------------------------------------

  fastify.get<{
    Params: { agentId: string };
    Querystring: { limit?: string; channel_id?: string };
  }>("/agents/:agentId/memory/recent", async (request, reply) => {
    const { agentId } = request.params;
    const { channel_id } = request.query;

    const limit = parseInt(request.query.limit ?? "10", 10);
    if (isNaN(limit) || limit < 1 || limit > 100) {
      return reply.status(400).send({ error: "limit must be between 1 and 100" });
    }

    const agent = await findAgent(agentId);
    if (!agent) {
      return reply.status(404).send({ error: `Agent not found: ${agentId}` });
    }

    try {
      const manager = new SemanticMemoryManager(agentId);
      const memories = await manager.getRecentMemories(limit, channel_id);

      return reply.send(memories);
    } catch (err) {
      fastify.log.error({ err, agentId }, "Error fetching recent memories");
      return reply.status(500).send({ error: "Failed to retrieve recent memories" });
    }
  });

  // -------------------------------------------------------------------------
  // POST /agents/:agentId/memory/summarize
  // Return the latest summary memory for the agent (optionally scoped to a
  // channel). Summaries are stored as memories with memoryType='summary'.
  // Query: channel_id?
  // -------------------------------------------------------------------------

  fastify.post<{
    Params: { agentId: string };
    Querystring: { channel_id?: string };
  }>("/agents/:agentId/memory/summarize", async (request, reply) => {
    const { agentId } = request.params;
    const { channel_id } = request.query;

    const agent = await findAgent(agentId);
    if (!agent) {
      return reply.status(404).send({ error: `Agent not found: ${agentId}` });
    }

    try {
      const manager = new SemanticMemoryManager(agentId);
      const summary = await manager.getSummary(channel_id);

      return reply.send({
        agent_name: agent.name,
        channel_id: channel_id ?? null,
        summary: summary ?? "No summary available for the requested period",
      });
    } catch (err) {
      fastify.log.error({ err, agentId }, "Error fetching memory summary");
      return reply.status(500).send({ error: "Failed to retrieve memory summary" });
    }
  });

  // -------------------------------------------------------------------------
  // DELETE /agents/:agentId/memory/cleanup
  // Delete old, low-importance memories to manage database size.
  // Query: days_old=30, min_importance_to_keep=7
  // Returns: { agent_name, deleted_count, days_old }
  // -------------------------------------------------------------------------

  fastify.delete<{
    Params: { agentId: string };
    Querystring: { days_old?: string; min_importance_to_keep?: string };
  }>("/agents/:agentId/memory/cleanup", async (request, reply) => {
    const { agentId } = request.params;

    const daysOld = parseInt(request.query.days_old ?? "30", 10);
    if (isNaN(daysOld) || daysOld < 1 || daysOld > 365) {
      return reply.status(400).send({ error: "days_old must be between 1 and 365" });
    }

    const minImportanceToKeep = parseInt(
      request.query.min_importance_to_keep ?? "7",
      10,
    );
    if (isNaN(minImportanceToKeep) || minImportanceToKeep < 1 || minImportanceToKeep > 10) {
      return reply.status(400).send({ error: "min_importance_to_keep must be between 1 and 10" });
    }

    const agent = await findAgent(agentId);
    if (!agent) {
      return reply.status(404).send({ error: `Agent not found: ${agentId}` });
    }

    try {
      const manager = new SemanticMemoryManager(agentId);
      const deletedCount = await manager.cleanupOldMemories(daysOld, minImportanceToKeep);

      fastify.log.info(
        `Memory cleanup for agent ${agentId}: deleted ${deletedCount} memories older than ${daysOld} days`,
      );

      return reply.send({
        agent_name: agent.name,
        deleted_count: deletedCount,
        days_old: daysOld,
      });
    } catch (err) {
      fastify.log.error({ err, agentId }, "Error during memory cleanup");
      return reply.status(500).send({ error: "Failed to clean up memories" });
    }
  });
}
