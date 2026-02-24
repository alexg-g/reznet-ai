/**
 * RezNet AI - Fastify Server Entry Point
 *
 * Fastify HTTP server + Socket.IO WebSocket server with full REST API.
 *
 * Features:
 *   - @fastify/cors configured from settings.CORS_ORIGINS
 *   - Socket.IO attached to the underlying http.Server
 *   - GET /health endpoint with PostgreSQL + Redis checks
 *   - GET /api/llm-config for active LLM configuration
 *   - Per-request query profiling middleware (X-Process-Time / X-Query headers)
 *   - REST API routes: channels, agents, messages, workflows, tasks, memories,
 *     uploads, agent templates
 *   - Graceful shutdown on SIGINT / SIGTERM
 */

import Fastify from "fastify";
import cors from "@fastify/cors";
import { Server as SocketIOServer } from "socket.io";
import { settings } from "./config.js";
import {
  checkPostgresHealth,
  checkRedisHealth,
  closeConnections,
  profilingStorage,
} from "./db/connection.js";
import { wsManager } from "./websocket/manager.js";
import { registerHandlers } from "./websocket/handlers.js";
import { clearAgentCache } from "./agents/processor.js";

// REST API route plugins (Phase 7)
import { channelRoutes } from "./routes/channels.js";
import { agentRoutes } from "./routes/agents.js";
import { workflowRoutes } from "./routes/workflows.js";
import { taskRoutes } from "./routes/tasks.js";
import { memoryRoutes } from "./routes/memories.js";
import { uploadRoutes } from "./routes/uploads.js";
import { templateRoutes } from "./routes/templates.js";

// ---------------------------------------------------------------------------
// Startup banner
// ---------------------------------------------------------------------------

function printBanner(): void {
  const now = new Date().toISOString();

  console.log("");
  console.log("  ██████  ███████ ███████ ███    ██ ███████ ████████     █████  ██ ");
  console.log("  ██   ██ ██         ███  ████   ██ ██         ██       ██   ██ ██ ");
  console.log("  ██████  █████     ███   ██ ██  ██ █████      ██       ███████ ██ ");
  console.log("  ██   ██ ██       ███    ██  ██ ██ ██         ██       ██   ██ ██ ");
  console.log("  ██   ██ ███████ ███████ ██   ████ ███████    ██       ██   ██ ██ ");
  console.log("");
  console.log("  RezNet AI Backend  v2.0.0  (TypeScript/Fastify)");
  console.log(`  Started: ${now}`);
  console.log("");

  // Active LLM provider + model
  const provider = settings.DEFAULT_LLM_PROVIDER;
  let activeModel = "(unknown)";
  if (provider === "anthropic") {
    activeModel = settings.ANTHROPIC_DEFAULT_MODEL;
  } else if (provider === "openai") {
    activeModel = settings.OPENAI_DEFAULT_MODEL;
  } else if (provider === "google") {
    activeModel = settings.GOOGLE_DEFAULT_MODEL;
  } else if (provider === "groq") {
    activeModel = settings.GROQ_DEFAULT_MODEL;
  } else if (provider === "ollama") {
    activeModel = settings.OLLAMA_DEFAULT_MODEL;
  }

  console.log(`  LLM Provider : ${provider}`);
  console.log(`  Active Model : ${activeModel}`);

  // Available providers (those with API key or enabled flag)
  console.log("");
  console.log("  Available Providers:");

  if (settings.ANTHROPIC_API_KEY) {
    const active = provider === "anthropic" ? " [active]" : "";
    console.log(`    [+] Anthropic (Claude)   ${settings.ANTHROPIC_DEFAULT_MODEL}${active}`);
  }
  if (settings.OPENAI_API_KEY) {
    const active = provider === "openai" ? " [active]" : "";
    console.log(`    [+] OpenAI (GPT)         ${settings.OPENAI_DEFAULT_MODEL}${active}`);
  }
  if (settings.GOOGLE_API_KEY) {
    const active = provider === "google" ? " [active]" : "";
    console.log(`    [+] Google (Gemini)      ${settings.GOOGLE_DEFAULT_MODEL}${active}`);
  }
  if (settings.GROQ_API_KEY) {
    const active = provider === "groq" ? " [active]" : "";
    console.log(`    [+] Groq (Llama)         ${settings.GROQ_DEFAULT_MODEL}${active}`);
  }
  if (settings.USE_OLLAMA) {
    const active = provider === "ollama" ? " [active]" : "";
    console.log(
      `    [+] Ollama (Local)       ${settings.OLLAMA_DEFAULT_MODEL}  [${settings.OLLAMA_HOST}]${active}`,
    );
  }

  console.log("");
  console.log(`  Debug Mode   : ${settings.DEBUG}`);
  console.log(`  Log Level    : ${settings.LOG_LEVEL}`);
  console.log("");
}

// ---------------------------------------------------------------------------
// Fastify instance
// ---------------------------------------------------------------------------

const fastify = Fastify({
  logger: {
    level: settings.LOG_LEVEL,
  },
});

// ---------------------------------------------------------------------------
// CORS plugin
// ---------------------------------------------------------------------------

await fastify.register(cors, {
  origin: settings.CORS_ORIGINS,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

// ---------------------------------------------------------------------------
// camelCase → snake_case response transformer
// The frontend (designed for Python/SQLAlchemy) expects snake_case JSON keys,
// but Drizzle ORM returns camelCase. This global hook converts all response
// keys before serialization.
// ---------------------------------------------------------------------------

/** Special-case field name overrides (Drizzle JS name → DB column name). */
const FIELD_OVERRIDES: Record<string, string> = {
  msgMetadata: "metadata",
  memMetadata: "metadata",
};

/** Convert a single camelCase key to snake_case. */
function camelToSnakeKey(key: string): string {
  if (FIELD_OVERRIDES[key]) return FIELD_OVERRIDES[key];
  return key.replace(/([A-Z])/g, "_$1").toLowerCase();
}

/** Recursively transform all object keys from camelCase to snake_case. */
function transformToSnakeCase(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(transformToSnakeCase);
  if (typeof obj === "object" && !(obj instanceof Date)) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[camelToSnakeKey(key)] = transformToSnakeCase(value);
    }
    return result;
  }
  return obj;
}

fastify.addHook("preSerialization", async (_request, _reply, payload) => {
  return transformToSnakeCase(payload);
});

// ---------------------------------------------------------------------------
// Per-request query profiling middleware
// Mirrors the database_query_profiling_middleware in main.py.
// Uses Fastify lifecycle hooks instead of ASGI middleware:
//   onRequest  -> start timer + activate profiling AsyncLocalStorage context
//   onSend     -> attach performance headers to the response
// ---------------------------------------------------------------------------

/**
 * Per-request state stored in Fastify's request object.
 * We augment the FastifyRequest type so TypeScript knows about our fields.
 */
declare module "fastify" {
  interface FastifyRequest {
    _startMs?: number;
    _profilingCtx?: import("./db/connection.js").QueryProfilingContext;
  }
}

fastify.addHook("onRequest", async (request) => {
  request._startMs = Date.now();
  request._profilingCtx = {
    queryCount: 0,
    queryTimeMs: 0,
    slowQueries: [],
  };
  // The async context runs for the duration of this request's async subtree.
  // We enter it here; the request handler + all awaited calls share the store.
  // Note: Fastify's hook pipeline is not wrapped in a single async call, so we
  // prime the context object and read it back in onSend — the db/connection.ts
  // profiled query wrapper writes directly into _profilingCtx via profilingStorage.
  profilingStorage.enterWith(request._profilingCtx);
});

fastify.addHook("onSend", async (request, reply, payload) => {
  const startMs = request._startMs ?? Date.now();
  const processTimeMs = Date.now() - startMs;
  const ctx = request._profilingCtx;

  const queryCount = ctx?.queryCount ?? 0;
  const queryTimeMs = ctx?.queryTimeMs ?? 0;
  const slowQueries = ctx?.slowQueries ?? [];

  void reply.header("X-Process-Time", `${processTimeMs.toFixed(2)}ms`);
  void reply.header("X-Query-Count", String(queryCount));
  void reply.header("X-Query-Time", `${queryTimeMs.toFixed(2)}ms`);

  // Warn on slow requests — mirrors Python thresholds (1000ms / 200ms)
  if (processTimeMs > 1000) {
    fastify.log.warn(
      `SLOW REQUEST: ${request.method} ${request.url} - ` +
        `Total: ${processTimeMs.toFixed(2)}ms, Queries: ${queryCount}, ` +
        `Query Time: ${queryTimeMs.toFixed(2)}ms`,
    );
  } else if (processTimeMs > 200) {
    fastify.log.info(
      `Medium latency: ${request.method} ${request.url} - ` +
        `${processTimeMs.toFixed(2)}ms (queries: ${queryCount})`,
    );
  }

  // Log individual slow queries (already warned by db/connection.ts, but repeat here for request context)
  for (const sq of slowQueries) {
    fastify.log.warn(
      `SLOW QUERY during ${request.method} ${request.url}: ` +
        `${sq.durationMs.toFixed(0)}ms - ${sq.statement.slice(0, 200)}`,
    );
  }

  return payload;
});

// ---------------------------------------------------------------------------
// Health endpoint
// GET /health
// ---------------------------------------------------------------------------

interface HealthReply {
  status: "ok" | "degraded" | "unhealthy";
  postgres: boolean;
  redis: boolean;
  uptime: number;
  version: string;
}

fastify.get<{ Reply: HealthReply }>("/health", async (_request, reply) => {
  const [postgres, redis] = await Promise.all([
    checkPostgresHealth(),
    checkRedisHealth(),
  ]);

  let status: "ok" | "degraded" | "unhealthy";
  if (postgres && redis) {
    status = "ok";
  } else if (!postgres && !redis) {
    status = "unhealthy";
  } else {
    status = "degraded";
  }

  const httpStatus = status === "ok" ? 200 : status === "degraded" ? 200 : 503;

  return reply.status(httpStatus).send({
    status,
    postgres,
    redis,
    uptime: process.uptime(),
    version: "2.0.0",
  });
});

// ---------------------------------------------------------------------------
// Root endpoint
// ---------------------------------------------------------------------------

fastify.get("/", async (_request, reply) => {
  return reply.send({
    service: "RezNet AI",
    version: "2.0.0",
    status: "running",
    health: "/health",
    docs: "/api",
  });
});

// ---------------------------------------------------------------------------
// LLM Config endpoint
// GET /api/llm-config
// ---------------------------------------------------------------------------

fastify.get("/api/llm-config", async (_request, reply) => {
  const provider = settings.DEFAULT_LLM_PROVIDER;

  // Determine active model
  let activeModel = "(unknown)";
  if (provider === "anthropic") activeModel = settings.ANTHROPIC_DEFAULT_MODEL;
  else if (provider === "openai") activeModel = settings.OPENAI_DEFAULT_MODEL;
  else if (provider === "google") activeModel = settings.GOOGLE_DEFAULT_MODEL;
  else if (provider === "groq") activeModel = settings.GROQ_DEFAULT_MODEL;
  else if (provider === "ollama") activeModel = settings.OLLAMA_DEFAULT_MODEL;

  // Build available providers list
  const availableProviders: Array<{
    name: string;
    model: string;
    active: boolean;
  }> = [];

  if (settings.ANTHROPIC_API_KEY) {
    availableProviders.push({
      name: "anthropic",
      model: settings.ANTHROPIC_DEFAULT_MODEL,
      active: provider === "anthropic",
    });
  }
  if (settings.OPENAI_API_KEY) {
    availableProviders.push({
      name: "openai",
      model: settings.OPENAI_DEFAULT_MODEL,
      active: provider === "openai",
    });
  }
  if (settings.GOOGLE_API_KEY) {
    availableProviders.push({
      name: "google",
      model: settings.GOOGLE_DEFAULT_MODEL,
      active: provider === "google",
    });
  }
  if (settings.GROQ_API_KEY) {
    availableProviders.push({
      name: "groq",
      model: settings.GROQ_DEFAULT_MODEL,
      active: provider === "groq",
    });
  }
  if (settings.USE_OLLAMA) {
    availableProviders.push({
      name: "ollama",
      model: settings.OLLAMA_DEFAULT_MODEL,
      active: provider === "ollama",
    });
  }

  return reply.send({
    default_provider: provider,
    active_model: activeModel,
    available_providers: availableProviders,
    embedding_provider: settings.DEFAULT_EMBEDDING_PROVIDER,
    embedding_model: settings.EMBEDDING_MODEL,
    max_tokens: settings.MAX_TOKENS_PER_RESPONSE,
    temperature: settings.DEFAULT_TEMPERATURE,
  });
});

// ---------------------------------------------------------------------------
// REST API routes (Phase 7)
// Registered under /api prefix to match frontend expectations
// ---------------------------------------------------------------------------

await fastify.register(channelRoutes, { prefix: "/api" });
await fastify.register(agentRoutes, { prefix: "/api" });
await fastify.register(workflowRoutes, { prefix: "/api" });
await fastify.register(taskRoutes, { prefix: "/api" });
await fastify.register(memoryRoutes, { prefix: "/api" });
await fastify.register(uploadRoutes, { prefix: "/api" });
await fastify.register(templateRoutes, { prefix: "/api" });

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  fastify.log.info(`Received ${signal} — shutting down RezNet AI...`);

  try {
    // Close Fastify server (stops accepting new requests)
    await fastify.close();
    fastify.log.info("Fastify server closed.");

    // Clear agent cache
    clearAgentCache();

    // Close PostgreSQL pool + Redis connection
    await closeConnections();

    fastify.log.info("RezNet AI shutdown complete. Goodbye.");
    process.exit(0);
  } catch (err) {
    fastify.log.error({ err }, "Error during shutdown");
    process.exit(1);
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

// ---------------------------------------------------------------------------
// Start server + attach Socket.IO
// ---------------------------------------------------------------------------

try {
  printBanner();

  const host = settings.BACKEND_HOST;
  const port = settings.BACKEND_PORT;

  // Listen — this binds the underlying http.Server
  await fastify.listen({ host, port });

  // Attach Socket.IO to the same underlying http.Server.
  // Must be done after listen() so fastify.server is the bound HTTP server.
  const io = new SocketIOServer(fastify.server, {
    cors: {
      origin: settings.CORS_ORIGINS,
      credentials: true,
      methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"],
  });

  // Wire up WebSocket manager and event handlers (Phase 4)
  wsManager.attach(io);
  registerHandlers(io);

  // Print access URLs after binding
  console.log("");
  console.log(`  API Server   : http://${host === "0.0.0.0" ? "localhost" : host}:${port}`);
  console.log(`  Socket.IO    : ws://${host === "0.0.0.0" ? "localhost" : host}:${port}/socket.io`);
  console.log(`  Health Check : http://${host === "0.0.0.0" ? "localhost" : host}:${port}/health`);
  console.log("");
} catch (err) {
  // Use console.error here since fastify.log may not be usable if bind failed
  console.error("[startup] Fatal error during server startup:", err);
  await closeConnections().catch(() => {
    // best-effort cleanup
  });
  process.exit(1);
}
