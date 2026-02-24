/**
 * Agent REST API Routes
 *
 * Fastify plugin exposing 9 endpoints under the /agents prefix.
 * Route registration order matters: /agents/name/:agentName must be
 * registered before /agents/:agentId so Fastify's radix-tree router
 * resolves the static segment "name" before the wildcard segment.
 *
 * Python reference: backend/routers/agents.py
 */

import { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { db } from "../db/connection.js";
import { redis } from "../db/connection.js";
import { agents, channels, type Agent } from "../db/schema.js";
import { resolveModel } from "../llm/client.js";
import { evictAgent } from "../agents/processor.js";

// ---------------------------------------------------------------------------
// Cache TTL constants
// ---------------------------------------------------------------------------

const AGENT_CACHE_TTL = 3600; // 1 hour — individual agent lookups
const AGENT_LIST_CACHE_TTL = 1800; // 30 minutes — agent list

// ---------------------------------------------------------------------------
// Helper: invalidate all cache keys for an agent
// ---------------------------------------------------------------------------

async function invalidateAgentCache(agentId: string, agentName: string): Promise<void> {
  await Promise.all([
    redis.del(`agents:${agentId}`),
    redis.del(`agents:${agentName}`),
    // Invalidate both variants of the list cache
    redis.del("agents:list:active=true"),
    redis.del("agents:list:active=false"),
  ]);
}

// ---------------------------------------------------------------------------
// Persona shape (JSONB is typed as unknown from Drizzle; cast for safe access)
// ---------------------------------------------------------------------------

interface AgentPersona {
  backstory?: string;
  role?: string;
  goal?: string;
  [key: string]: unknown;
}

function parsePersona(raw: unknown): AgentPersona {
  if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as AgentPersona;
  }
  return {};
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export async function agentRoutes(fastify: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // GET /agents
  // List all agents. Optional query param: active_only (default: true).
  // Cache key: agents:list:active={true|false}, TTL 1800s.
  // -------------------------------------------------------------------------

  fastify.get<{
    Querystring: { active_only?: string };
  }>("/agents", async (request, reply) => {
    const activeOnly = request.query.active_only !== "false";
    const cacheKey = `agents:list:active=${String(activeOnly)}`;

    const cached = await redis.get(cacheKey);
    if (cached) {
      return reply.send(JSON.parse(cached) as Agent[]);
    }

    const rows = activeOnly
      ? await db.select().from(agents).where(eq(agents.isActive, true))
      : await db.select().from(agents);

    await redis.set(cacheKey, JSON.stringify(rows), "EX", AGENT_LIST_CACHE_TTL);
    return reply.send(rows);
  });

  // -------------------------------------------------------------------------
  // GET /agents/name/:agentName
  // Registered BEFORE /agents/:agentId so "name" matches before the wildcard.
  // Adds "@" prefix if not present.
  // Cache key: agents:{@name}, TTL 3600s.
  // -------------------------------------------------------------------------

  fastify.get<{
    Params: { agentName: string };
  }>("/agents/name/:agentName", async (request, reply) => {
    const rawName = request.params.agentName;
    const agentName = rawName.startsWith("@") ? rawName : `@${rawName}`;
    const cacheKey = `agents:${agentName}`;

    const cached = await redis.get(cacheKey);
    if (cached) {
      return reply.send(JSON.parse(cached) as Agent);
    }

    const [agent] = await db.select().from(agents).where(eq(agents.name, agentName));
    if (!agent) {
      return reply.status(404).send({ error: "Agent not found" });
    }

    await redis.set(cacheKey, JSON.stringify(agent), "EX", AGENT_CACHE_TTL);
    return reply.send(agent);
  });

  // -------------------------------------------------------------------------
  // GET /agents/:agentId
  // Get agent by UUID. Cache key: agents:{id}, TTL 3600s.
  // -------------------------------------------------------------------------

  fastify.get<{
    Params: { agentId: string };
  }>("/agents/:agentId", async (request, reply) => {
    const { agentId } = request.params;
    const cacheKey = `agents:${agentId}`;

    const cached = await redis.get(cacheKey);
    if (cached) {
      return reply.send(JSON.parse(cached) as Agent);
    }

    const [agent] = await db.select().from(agents).where(eq(agents.id, agentId));
    if (!agent) {
      return reply.status(404).send({ error: "Agent not found" });
    }

    await redis.set(cacheKey, JSON.stringify(agent), "EX", AGENT_CACHE_TTL);
    return reply.send(agent);
  });

  // -------------------------------------------------------------------------
  // POST /agents/:agentId/invoke
  // Invoke an agent with a message.
  // Body: { message: string, context?: Record<string, unknown>, channel_id?: string }
  // Returns a stub response until the LLM pipeline is connected (Phase 3).
  // -------------------------------------------------------------------------

  fastify.post<{
    Params: { agentId: string };
    Body: {
      message: string;
      context?: Record<string, unknown>;
      channel_id?: string;
    };
  }>("/agents/:agentId/invoke", async (request, reply) => {
    const { agentId } = request.params;
    const { message } = request.body;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return reply.status(400).send({ error: "message is required and must be a non-empty string" });
    }

    const [agent] = await db.select().from(agents).where(eq(agents.id, agentId));
    if (!agent) {
      return reply.status(404).send({ error: "Agent not found" });
    }
    if (!agent.isActive) {
      return reply.status(400).send({ error: "Agent is not active" });
    }

    return reply.send({
      agent_id: agent.id,
      agent_name: agent.name,
      response: "Agent invocation not yet connected to LLM pipeline",
      status: "pending",
    });
  });

  // -------------------------------------------------------------------------
  // GET /agents/:agentId/status
  // Returns agent online/offline status derived from the isActive flag.
  // -------------------------------------------------------------------------

  fastify.get<{
    Params: { agentId: string };
  }>("/agents/:agentId/status", async (request, reply) => {
    const { agentId } = request.params;

    const [agent] = await db.select().from(agents).where(eq(agents.id, agentId));
    if (!agent) {
      return reply.status(404).send({ error: "Agent not found" });
    }

    return reply.send({
      agent_id: agent.id,
      agent_name: agent.name,
      status: agent.isActive ? "online" : "offline",
      agent_type: agent.agentType,
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /agents/:agentId/activate
  // Set isActive = true. Invalidates agent + list cache.
  // -------------------------------------------------------------------------

  fastify.patch<{
    Params: { agentId: string };
  }>("/agents/:agentId/activate", async (request, reply) => {
    const { agentId } = request.params;

    const [existing] = await db.select().from(agents).where(eq(agents.id, agentId));
    if (!existing) {
      return reply.status(404).send({ error: "Agent not found" });
    }

    const [updated] = await db
      .update(agents)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(agents.id, agentId))
      .returning();

    await invalidateAgentCache(agentId, existing.name);

    return reply.send(updated);
  });

  // -------------------------------------------------------------------------
  // PATCH /agents/:agentId/deactivate
  // Set isActive = false. Invalidates agent + list cache.
  // -------------------------------------------------------------------------

  fastify.patch<{
    Params: { agentId: string };
  }>("/agents/:agentId/deactivate", async (request, reply) => {
    const { agentId } = request.params;

    const [existing] = await db.select().from(agents).where(eq(agents.id, agentId));
    if (!existing) {
      return reply.status(404).send({ error: "Agent not found" });
    }

    const [updated] = await db
      .update(agents)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(agents.id, agentId))
      .returning();

    await invalidateAgentCache(agentId, existing.name);

    return reply.send(updated);
  });

  // -------------------------------------------------------------------------
  // PATCH /agents/:agentId/config
  // Update per-agent LLM configuration (provider and/or model).
  // Merges with existing config, evicts agent cache so next invocation
  // picks up the new model.
  // -------------------------------------------------------------------------

  fastify.patch<{
    Params: { agentId: string };
    Body: { provider?: string; model?: string };
  }>("/agents/:agentId/config", async (request, reply) => {
    const { agentId } = request.params;
    const { provider, model } = request.body;

    // Validate provider/model combination if either is provided
    if (provider || model) {
      try {
        resolveModel(provider, model);
      } catch {
        return reply.status(400).send({ error: "Invalid provider/model combination" });
      }
    }

    const [existing] = await db.select().from(agents).where(eq(agents.id, agentId));
    if (!existing) {
      return reply.status(404).send({ error: "Agent not found" });
    }

    // Merge with existing config
    const currentConfig = (existing.config ?? {}) as Record<string, unknown>;
    const newConfig = { ...currentConfig };
    if (provider !== undefined) newConfig.provider = provider;
    if (model !== undefined) newConfig.model = model;

    const [updated] = await db
      .update(agents)
      .set({ config: newConfig, updatedAt: new Date() })
      .where(eq(agents.id, agentId))
      .returning();

    // Evict from in-memory agent cache so next invocation uses new model
    evictAgent(agentId);

    // Invalidate Redis cache
    await invalidateAgentCache(agentId, existing.name);

    return reply.send(updated);
  });

  // -------------------------------------------------------------------------
  // GET /agents/:agentId/dm-channel
  // Get or create the DM channel for an agent.
  // Channel name pattern: dm-{agent.name}  (e.g. "dm-@backend")
  // On creation: channelType='dm', dmAgentId=agent.id.
  // -------------------------------------------------------------------------

  fastify.get<{
    Params: { agentId: string };
  }>("/agents/:agentId/dm-channel", async (request, reply) => {
    const { agentId } = request.params;

    const [agent] = await db.select().from(agents).where(eq(agents.id, agentId));
    if (!agent) {
      return reply.status(404).send({ error: "Agent not found" });
    }

    const channelName = `dm-${agent.name}`;

    // Try to find an existing DM channel for this agent
    const [existingChannel] = await db
      .select()
      .from(channels)
      .where(
        and(
          eq(channels.dmAgentId, agentId),
          eq(channels.channelType, "dm"),
        ),
      );

    if (existingChannel) {
      return reply.send(existingChannel);
    }

    // Create a new DM channel
    const [newChannel] = await db
      .insert(channels)
      .values({
        name: channelName,
        channelType: "dm",
        dmAgentId: agentId,
        topic: `Direct messages with ${agent.name}`,
      })
      .returning();

    return reply.status(201).send(newChannel);
  });

  // -------------------------------------------------------------------------
  // GET /agents/:agentId/system-prompt
  // Return agent persona and system prompt info.
  // No LLM instance required — reads directly from the persona JSONB column.
  // -------------------------------------------------------------------------

  fastify.get<{
    Params: { agentId: string };
  }>("/agents/:agentId/system-prompt", async (request, reply) => {
    const { agentId } = request.params;

    const [agent] = await db.select().from(agents).where(eq(agents.id, agentId));
    if (!agent) {
      return reply.status(404).send({ error: "Agent not found" });
    }

    const persona = parsePersona(agent.persona);

    return reply.send({
      agent_id: agent.id,
      agent_name: agent.name,
      agent_type: agent.agentType,
      system_prompt: persona.backstory ?? "No system prompt configured",
      persona,
    });
  });
}
