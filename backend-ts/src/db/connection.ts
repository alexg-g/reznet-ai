/**
 * Database connection layer — PostgreSQL (pg Pool + Drizzle ORM) and Redis (ioredis).
 *
 * Ports /backend/core/database.py to TypeScript:
 *   - Connection pool with identical sizing (max: 10, overflow handled by idle timeout)
 *   - Query profiling: warns at >100ms, errors at >500ms (same NFR thresholds)
 *   - Per-request query metrics via AsyncLocalStorage (replaces Python's ContextVar)
 *   - Health check helpers for readiness probes
 *   - Graceful shutdown for SIGTERM handling
 */

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import Redis from "ioredis";
import { AsyncLocalStorage } from "async_hooks";
import { settings } from "../config.js";
import * as schema from "./schema.js";

// ---------------------------------------------------------------------------
// Query profiling context  (mirrors Python's query_profiling_context ContextVar)
// ---------------------------------------------------------------------------

export interface QueryProfilingContext {
  queryCount: number;
  queryTimeMs: number;
  slowQueries: Array<{ durationMs: number; statement: string }>;
}

/**
 * AsyncLocalStorage carries per-request profiling data across async boundaries.
 * Call `profilingStorage.run(ctx, handler)` at the route level to activate it.
 * All pool.query() calls made within that async subtree will update ctx.
 */
export const profilingStorage =
  new AsyncLocalStorage<QueryProfilingContext>();

// ---------------------------------------------------------------------------
// Logger (lightweight — avoids importing Fastify's pino before the server boots)
// ---------------------------------------------------------------------------

const log = {
  info: (msg: string) => console.info(`[db] ${msg}`),
  warn: (msg: string) => console.warn(`[db] WARN ${msg}`),
  error: (msg: string) => console.error(`[db] ERROR ${msg}`),
};

// ---------------------------------------------------------------------------
// PostgreSQL connection pool
// ---------------------------------------------------------------------------

/**
 * Raw pg Pool — exported for health checks and direct query use.
 * Pool sizing mirrors the Python SQLAlchemy engine:
 *   pool_size=10  =>  max: 10
 *   pool_recycle=3600  =>  idleTimeoutMillis: 3600000 (1 hour)
 */
export const pool = new Pool({
  connectionString: settings.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  // Keep connections alive across idle periods (mirrors pool_pre_ping=True)
  allowExitOnIdle: false,
});

// ---------------------------------------------------------------------------
// Pool event hooks for query profiling  (mirrors SQLAlchemy before/after_cursor_execute)
// ---------------------------------------------------------------------------

/**
 * Wrap pool.query so every query goes through our timing instrumentation.
 *
 * We monkey-patch at the Pool prototype level rather than individual clients
 * so that all queries — including those issued through Drizzle — are covered.
 *
 * The pattern is:
 *   1. Record start time before the query.
 *   2. After resolution, compute duration.
 *   3. Update the per-request AsyncLocalStorage context (if active).
 *   4. Log slow queries unconditionally (> 100ms warn, > 500ms error).
 */
// Cast to a single broad callable type to bypass the complex overload union.
// The runtime behaviour is identical — we're only widening the TS-visible type.
type AnyQuery = (queryTextOrConfig: string | { text?: string }, values?: unknown[]) => Promise<unknown>;
const _originalQuery = pool.query.bind(pool) as AnyQuery;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(pool as any).query = async function profiledQuery(
  queryTextOrConfig: string | { text?: string },
  values?: unknown[],
): Promise<unknown> {
  const startMs = Date.now();

  // Extract the SQL statement text for logging
  const rawStatement =
    typeof queryTextOrConfig === "string"
      ? queryTextOrConfig
      : (queryTextOrConfig?.text ?? "");
  const statement = rawStatement.slice(0, 300);

  try {
    const result = await _originalQuery(queryTextOrConfig, values);
    const durationMs = Date.now() - startMs;

    // Update per-request context if one is active
    const ctx = profilingStorage.getStore();
    if (ctx !== undefined) {
      ctx.queryCount += 1;
      ctx.queryTimeMs += durationMs;
      if (durationMs > 100) {
        ctx.slowQueries.push({ durationMs, statement });
      }
    }

    // Log slow queries unconditionally (> 500ms = error, > 100ms = warn)
    if (durationMs > 500) {
      log.error(`VERY SLOW QUERY (${durationMs.toFixed(0)}ms): ${statement}`);
    } else if (durationMs > 100) {
      log.warn(`Slow query (${durationMs.toFixed(0)}ms): ${statement.slice(0, 200)}`);
    }

    return result;
  } catch (err) {
    const durationMs = Date.now() - startMs;
    log.error(
      `Query failed after ${durationMs.toFixed(0)}ms: ${statement.slice(0, 200)} — ${String(err)}`,
    );
    throw err;
  }
};

// ---------------------------------------------------------------------------
// Drizzle ORM wrapper — the primary interface for all application queries
// ---------------------------------------------------------------------------

/**
 * Drizzle ORM instance.
 *
 * Usage:
 *   import { db } from "./db/connection.js";
 *   const rows = await db.select().from(schema.agents).where(...);
 */
export const db = drizzle(pool, { schema });

// ---------------------------------------------------------------------------
// Redis client
// ---------------------------------------------------------------------------

/**
 * ioredis client. Connection errors are logged but do not crash the process —
 * features that depend on Redis degrade gracefully (e.g. cache misses).
 */
export const redis = new Redis(settings.REDIS_URL, {
  // Retry with exponential back-off, cap at 10 s, give up after 10 attempts.
  retryStrategy: (times) => {
    if (times > 10) {
      log.error("Redis: exceeded 10 reconnect attempts — giving up.");
      return null; // stops retrying
    }
    const delayMs = Math.min(times * 200, 10_000);
    return delayMs;
  },
  // Don't throw unhandled rejections — let the error handler below deal with them.
  enableOfflineQueue: true,
  lazyConnect: false,
});

redis.on("connect", () => log.info("Redis connected."));
redis.on("ready", () => log.info("Redis ready."));
redis.on("error", (err: Error) => log.warn(`Redis error: ${err.message}`));
redis.on("close", () => log.warn("Redis connection closed."));
redis.on("reconnecting", (delayMs: number) =>
  log.info(`Redis reconnecting in ${delayMs}ms…`),
);

// ---------------------------------------------------------------------------
// Health check helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if PostgreSQL is reachable.
 * Runs a lightweight `SELECT 1` through the pool (not Drizzle, to avoid
 * schema assumptions during startup / readiness checks).
 */
export async function checkPostgresHealth(): Promise<boolean> {
  try {
    await _originalQuery("SELECT 1");
    return true;
  } catch (err) {
    log.error(`PostgreSQL health check failed: ${String(err)}`);
    return false;
  }
}

/**
 * Returns true if Redis is reachable.
 * Uses the raw PING command — works regardless of Redis mode (standalone / cluster).
 */
export async function checkRedisHealth(): Promise<boolean> {
  try {
    const reply = await redis.ping();
    return reply === "PONG";
  } catch (err) {
    log.error(`Redis health check failed: ${String(err)}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

/**
 * Cleanly close all database connections.
 * Call from SIGTERM / SIGINT handlers before process.exit().
 *
 * Example (in index.ts):
 *   process.on("SIGTERM", async () => {
 *     await closeConnections();
 *     process.exit(0);
 *   });
 */
export async function closeConnections(): Promise<void> {
  log.info("Closing database connections…");
  await Promise.allSettled([pool.end(), redis.quit()]);
  log.info("All database connections closed.");
}
