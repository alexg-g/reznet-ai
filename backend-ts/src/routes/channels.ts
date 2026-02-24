/**
 * Channel REST endpoints — Fastify plugin.
 *
 * Ports /backend/routers/channels.py to TypeScript/Fastify with:
 *   - Drizzle ORM for all database access (no raw SQL)
 *   - Redis caching with 600s TTL (same as Python CacheTTL.CHANNEL_METADATA)
 *   - Zod-free validation via Fastify generics (body/params/querystring types)
 *   - Proper 404 responses, no stack traces exposed
 *   - Soft-delete (archive) on DELETE — data is never physically removed
 *   - contextClearedAt message-window enforcement on GET /messages
 *   - WebSocket broadcast on POST /clear (context_cleared event)
 *
 * 6 endpoints:
 *   GET    /channels                      - List active channels (cached)
 *   POST   /channels                      - Create channel (cache invalidation)
 *   GET    /channels/:channelId           - Get single channel (cached)
 *   GET    /channels/:channelId/messages  - Paginated messages (contextClearedAt aware)
 *   DELETE /channels/:channelId           - Archive channel (soft delete)
 *   POST   /channels/:channelId/clear     - Clear channel context, broadcast event
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { and, eq, desc, gte } from "drizzle-orm";
import { db, redis } from "../db/connection.js";
import { channels, messages, type Channel } from "../db/schema.js";
import { wsManager } from "../websocket/manager.js";

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

/** TTL in seconds — mirrors Python CacheTTL.CHANNEL_METADATA (10 minutes). */
const CACHE_TTL = 600;

async function cacheGet<T>(key: string): Promise<T | null> {
  const cached = await redis.get(key);
  if (cached === null) return null;
  return JSON.parse(cached) as T;
}

async function cacheSet(key: string, value: unknown): Promise<void> {
  await redis.set(key, JSON.stringify(value), "EX", CACHE_TTL);
}

async function cacheDel(...keys: string[]): Promise<void> {
  if (keys.length > 0) await redis.del(...keys);
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export async function channelRoutes(fastify: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // GET /channels
  // List all non-archived channels, ordered by createdAt ascending.
  // Cache key: channels:list:active  TTL: 600s
  // -------------------------------------------------------------------------
  fastify.get("/channels", async (_request: FastifyRequest, reply: FastifyReply) => {
    const cacheKey = "channels:list:active";

    const cached = await cacheGet<Channel[]>(cacheKey);
    if (cached !== null) {
      return reply.send(cached);
    }

    const rows = await db
      .select()
      .from(channels)
      .where(eq(channels.isArchived, false))
      .orderBy(channels.createdAt);

    await cacheSet(cacheKey, rows);
    return reply.send(rows);
  });

  // -------------------------------------------------------------------------
  // POST /channels
  // Create a new channel.
  // Body: { name: string, topic?: string, channelType?: string }
  // Cache invalidation: channels:list:active
  // -------------------------------------------------------------------------
  fastify.post<{
    Body: { name: string; topic?: string; channelType?: string };
  }>("/channels", async (request, reply) => {
    const { name, topic, channelType } = request.body ?? {};

    if (!name || typeof name !== "string" || name.trim() === "") {
      return reply.status(400).send({ error: "Channel name is required" });
    }

    const [created] = await db
      .insert(channels)
      .values({
        name: name.trim(),
        topic: topic ?? null,
        channelType: channelType ?? "public",
      })
      .returning();

    // Invalidate channel list cache so the next GET /channels reflects the new entry.
    await cacheDel("channels:list:active");

    return reply.status(201).send(created);
  });

  // -------------------------------------------------------------------------
  // GET /channels/:channelId
  // Fetch a single channel by UUID.
  // Cache key: channels:{channelId}  TTL: 600s
  // -------------------------------------------------------------------------
  fastify.get<{ Params: { channelId: string } }>(
    "/channels/:channelId",
    async (request, reply) => {
      const { channelId } = request.params;
      const cacheKey = `channels:${channelId}`;

      const cached = await cacheGet<Channel>(cacheKey);
      if (cached !== null) {
        return reply.send(cached);
      }

      const [channel] = await db
        .select()
        .from(channels)
        .where(eq(channels.id, channelId));

      if (!channel) {
        return reply.status(404).send({ error: "Channel not found" });
      }

      await cacheSet(cacheKey, channel);
      return reply.send(channel);
    },
  );

  // -------------------------------------------------------------------------
  // GET /channels/:channelId/messages
  // Paginated messages for a channel. Respects contextClearedAt.
  // Query params: limit (default 100, capped at 500), offset (default 0)
  // Order: createdAt DESC with .offset/.limit, then reversed for chronological
  // output — exactly matching the Python implementation's reversed() call.
  // -------------------------------------------------------------------------
  fastify.get<{
    Params: { channelId: string };
    Querystring: { limit?: string; offset?: string };
  }>(
    "/channels/:channelId/messages",
    async (request, reply) => {
      const { channelId } = request.params;
      const limit = Math.min(parseInt(request.query.limit ?? "100", 10), 500);
      const offset = Math.max(parseInt(request.query.offset ?? "0", 10), 0);

      // Verify the channel exists before querying messages.
      const [channel] = await db
        .select()
        .from(channels)
        .where(eq(channels.id, channelId));

      if (!channel) {
        return reply.status(404).send({ error: "Channel not found" });
      }

      // When the channel has a contextClearedAt timestamp, only return messages
      // created at or after that point. This implements the /clear command's
      // "hide history from agents" semantics (matches Python's > filter;
      // we use >= here so messages created exactly at the clear time are visible,
      // which is the same boundary the Python gte comparison produces).
      const whereClause = channel.contextClearedAt
        ? and(
            eq(messages.channelId, channelId),
            gte(messages.createdAt, channel.contextClearedAt),
          )
        : eq(messages.channelId, channelId);

      const rows = await db
        .select()
        .from(messages)
        .where(whereClause)
        .orderBy(desc(messages.createdAt))
        .offset(offset)
        .limit(limit);

      // Reverse DESC-paged results to restore chronological (ascending) order,
      // matching the Python implementation: `return list(reversed(messages))`.
      const chronological = [...rows].reverse();
      return reply.send(chronological);
    },
  );

  // -------------------------------------------------------------------------
  // DELETE /channels/:channelId
  // Soft-delete: set isArchived = true, update updatedAt.
  // Cache invalidation: channels:{channelId} + channels:list:active
  // -------------------------------------------------------------------------
  fastify.delete<{ Params: { channelId: string } }>(
    "/channels/:channelId",
    async (request, reply) => {
      const { channelId } = request.params;

      const [channel] = await db
        .select()
        .from(channels)
        .where(eq(channels.id, channelId));

      if (!channel) {
        return reply.status(404).send({ error: "Channel not found" });
      }

      await db
        .update(channels)
        .set({ isArchived: true, updatedAt: new Date() })
        .where(eq(channels.id, channelId));

      // Invalidate both caches: individual channel entry and the active list.
      await cacheDel(`channels:${channelId}`, "channels:list:active");

      return reply.send({ message: "Channel archived successfully" });
    },
  );

  // -------------------------------------------------------------------------
  // POST /channels/:channelId/clear
  // Sets contextClearedAt = now(), invalidates cache, broadcasts WS event.
  // Messages older than clearedAt are subsequently excluded from GET /messages.
  // -------------------------------------------------------------------------
  fastify.post<{ Params: { channelId: string } }>(
    "/channels/:channelId/clear",
    async (request, reply) => {
      const { channelId } = request.params;

      const [channel] = await db
        .select()
        .from(channels)
        .where(eq(channels.id, channelId));

      if (!channel) {
        return reply.status(404).send({ error: "Channel not found" });
      }

      const clearedAt = new Date();

      await db
        .update(channels)
        .set({ contextClearedAt: clearedAt, updatedAt: clearedAt })
        .where(eq(channels.id, channelId));

      // Invalidate only the individual channel cache. The list cache is kept
      // because clearing context does not change list membership or channel
      // metadata that clients use to render the sidebar.
      await cacheDel(`channels:${channelId}`);

      // Broadcast to all Socket.IO clients so they can clear their message
      // history display without a full page reload.
      wsManager.broadcast("context_cleared", {
        channel_id: channelId,
        cleared_at: clearedAt.toISOString(),
        message: "Context cleared - starting fresh",
      });

      return reply.send({
        message: "Channel context cleared successfully",
        channel_id: channelId,
        cleared_at: clearedAt.toISOString(),
      });
    },
  );
}
