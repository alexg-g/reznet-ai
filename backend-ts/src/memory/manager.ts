/**
 * Semantic Memory Manager
 *
 * Manages agent long-term memory with pgvector semantic search.
 *
 * Replaces backend/agents/memory_manager.py (553 LOC).
 *
 * Features:
 *   - Store memories with vector embeddings
 *   - Retrieve semantically relevant memories (cosine distance)
 *   - Importance scoring (1-10)
 *   - Memory type classification (conversation, decision, entity, summary, tool_use)
 *   - Access tracking for adaptive retrieval
 *   - Context summarization via LLM
 *   - Old memory cleanup
 *
 * Uses Drizzle's native cosineDistance() for pgvector queries.
 * Same embedding model (nomic-embed-text, 768 dims) — no re-embedding needed.
 */

import { randomUUID } from "crypto";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import { cosineDistance } from "drizzle-orm";
import { db } from "../db/connection.js";
import { agentMemories } from "../db/schema.js";
import { generateEmbedding, type EmbeddingProvider } from "./embeddings.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MemoryType =
  | "conversation"
  | "decision"
  | "entity"
  | "summary"
  | "tool_use";

export interface StoreMemoryOptions {
  content: string;
  memoryType?: MemoryType;
  importance?: number;
  channelId?: string;
  metadata?: Record<string, unknown>;
}

export interface RetrieveOptions {
  query: string;
  limit?: number;
  memoryTypes?: MemoryType[];
  channelId?: string;
  minImportance?: number;
}

export interface MemoryRecord {
  id: string;
  content: string;
  memoryType: string;
  importance: number;
  relevanceScore: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  accessCount: number;
}

export interface MemoryStats {
  totalMemories: number;
  byType: Record<string, number>;
  averageImportance: number;
}

// ---------------------------------------------------------------------------
// SemanticMemoryManager
// ---------------------------------------------------------------------------

export class SemanticMemoryManager {
  readonly agentId: string;
  private embeddingProvider: EmbeddingProvider | undefined;

  constructor(
    agentId: string,
    opts?: {
      embeddingProvider?: EmbeddingProvider;
    },
  ) {
    this.agentId = agentId;
    this.embeddingProvider = opts?.embeddingProvider;
  }

  // -------------------------------------------------------------------------
  // Store
  // -------------------------------------------------------------------------

  /**
   * Store a new memory with semantic embedding.
   *
   * @param opts - Memory content, type, importance, channel, metadata
   * @returns Created memory ID
   */
  async store(opts: StoreMemoryOptions): Promise<string> {
    const {
      content,
      memoryType = "conversation",
      importance = 5,
      channelId,
      metadata = {},
    } = opts;

    // Generate embedding
    const embedding = await generateEmbedding(content, this.embeddingProvider);

    // Insert memory record
    const id = randomUUID();
    await db.insert(agentMemories).values({
      id,
      agentId: this.agentId,
      channelId: channelId ?? null,
      content,
      embedding,
      memoryType,
      importance,
      memMetadata: metadata,
      accessCount: 0,
    });

    return id;
  }

  // -------------------------------------------------------------------------
  // Retrieve (semantic search)
  // -------------------------------------------------------------------------

  /**
   * Retrieve semantically relevant memories using cosine distance.
   *
   * @param opts - Query text, limit, filters
   * @returns Array of memory records with relevance scores
   */
  async retrieveRelevant(opts: RetrieveOptions): Promise<MemoryRecord[]> {
    const {
      query,
      limit = 5,
      memoryTypes,
      channelId,
      minImportance = 3,
    } = opts;

    // Generate query embedding
    const queryEmbedding = await generateEmbedding(
      query,
      this.embeddingProvider,
    );

    // Build cosine distance expression
    const distance = cosineDistance(agentMemories.embedding, queryEmbedding);

    // Build conditions
    const conditions = [
      eq(agentMemories.agentId, this.agentId),
      gte(agentMemories.importance, minImportance),
    ];

    if (memoryTypes && memoryTypes.length > 0) {
      // Use sql template for IN clause
      conditions.push(
        sql`${agentMemories.memoryType} IN (${sql.join(
          memoryTypes.map((t) => sql`${t}`),
          sql`, `,
        )})`,
      );
    }

    if (channelId) {
      conditions.push(eq(agentMemories.channelId, channelId));
    }

    // Query with cosine distance ordering
    const results = await db
      .select({
        id: agentMemories.id,
        content: agentMemories.content,
        memoryType: agentMemories.memoryType,
        importance: agentMemories.importance,
        memMetadata: agentMemories.memMetadata,
        createdAt: agentMemories.createdAt,
        accessCount: agentMemories.accessCount,
        distance,
      })
      .from(agentMemories)
      .where(and(...conditions))
      .orderBy(distance)
      .limit(limit);

    // Update access tracking for retrieved memories
    const memoryIds = results.map((r) => r.id);
    if (memoryIds.length > 0) {
      for (const memId of memoryIds) {
        await db
          .update(agentMemories)
          .set({
            accessCount: sql`${agentMemories.accessCount} + 1`,
            accessedAt: new Date(),
          })
          .where(eq(agentMemories.id, memId));
      }
    }

    // Format results
    return results.map((r) => ({
      id: r.id,
      content: r.content,
      memoryType: r.memoryType ?? "conversation",
      importance: r.importance ?? 5,
      relevanceScore: 1.0 - Number(r.distance ?? 0), // cosine distance → similarity
      metadata: (r.memMetadata ?? {}) as Record<string, unknown>,
      createdAt: r.createdAt?.toISOString() ?? new Date().toISOString(),
      accessCount: (r.accessCount ?? 0) + 1, // +1 for this access
    }));
  }

  // -------------------------------------------------------------------------
  // Recent memories
  // -------------------------------------------------------------------------

  /**
   * Get most recent memories (for building context window).
   */
  async getRecentMemories(
    limit = 10,
    channelId?: string,
  ): Promise<MemoryRecord[]> {
    const conditions = [eq(agentMemories.agentId, this.agentId)];

    if (channelId) {
      conditions.push(eq(agentMemories.channelId, channelId));
    }

    const results = await db
      .select()
      .from(agentMemories)
      .where(and(...conditions))
      .orderBy(desc(agentMemories.createdAt))
      .limit(limit);

    // Return in chronological order (reverse of DESC)
    return results.reverse().map((m) => ({
      id: m.id,
      content: m.content,
      memoryType: m.memoryType ?? "conversation",
      importance: m.importance ?? 5,
      relevanceScore: 1.0, // Recent memories are inherently relevant
      metadata: (m.memMetadata ?? {}) as Record<string, unknown>,
      createdAt: m.createdAt?.toISOString() ?? new Date().toISOString(),
      accessCount: m.accessCount ?? 0,
    }));
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------

  /**
   * Get the most recent summary memory.
   */
  async getSummary(
    channelId?: string,
    timeWindowHours = 24,
  ): Promise<string | null> {
    const cutoff = new Date(Date.now() - timeWindowHours * 3600 * 1000);

    const conditions = [
      eq(agentMemories.agentId, this.agentId),
      eq(agentMemories.memoryType, "summary"),
      gte(agentMemories.createdAt, cutoff),
    ];

    if (channelId) {
      conditions.push(eq(agentMemories.channelId, channelId));
    }

    const results = await db
      .select({ content: agentMemories.content })
      .from(agentMemories)
      .where(and(...conditions))
      .orderBy(desc(agentMemories.createdAt))
      .limit(1);

    return results[0]?.content ?? null;
  }

  // -------------------------------------------------------------------------
  // Statistics
  // -------------------------------------------------------------------------

  /**
   * Get statistics about agent's memory.
   */
  async getStats(channelId?: string): Promise<MemoryStats> {
    const conditions = [eq(agentMemories.agentId, this.agentId)];

    if (channelId) {
      conditions.push(eq(agentMemories.channelId, channelId));
    }

    // Total count
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(agentMemories)
      .where(and(...conditions));

    const totalMemories = Number(countResult[0]?.count ?? 0);

    // Count by type
    const typeResults = await db
      .select({
        memoryType: agentMemories.memoryType,
        count: sql<number>`count(*)`,
      })
      .from(agentMemories)
      .where(and(...conditions))
      .groupBy(agentMemories.memoryType);

    const byType: Record<string, number> = {};
    for (const row of typeResults) {
      byType[row.memoryType ?? "unknown"] = Number(row.count);
    }

    // Average importance
    const avgResult = await db
      .select({ avg: sql<number>`avg(${agentMemories.importance})` })
      .from(agentMemories)
      .where(and(...conditions));

    const averageImportance = Math.round(
      (Number(avgResult[0]?.avg ?? 0) + Number.EPSILON) * 100,
    ) / 100;

    return {
      totalMemories,
      byType,
      averageImportance,
    };
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  /**
   * Clean up old, low-importance memories.
   *
   * @param daysOld - Delete memories older than this
   * @param minImportanceToKeep - Keep memories with importance >= this value
   * @returns Number of memories deleted
   */
  async cleanupOldMemories(
    daysOld = 30,
    minImportanceToKeep = 7,
  ): Promise<number> {
    const cutoff = new Date(Date.now() - daysOld * 24 * 3600 * 1000);

    const result = await db
      .delete(agentMemories)
      .where(
        and(
          eq(agentMemories.agentId, this.agentId),
          sql`${agentMemories.createdAt} < ${cutoff}`,
          sql`${agentMemories.importance} < ${minImportanceToKeep}`,
        ),
      )
      .returning({ id: agentMemories.id });

    return result.length;
  }
}
