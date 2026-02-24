/**
 * Phase 1 Validation Tests
 *
 * Validates all Phase 1 acceptance criteria:
 *   1. Zod config loads and validates correctly
 *   2. PostgreSQL connects and responds to health check
 *   3. Redis connects and responds to PING
 *   4. Drizzle ORM can read existing agents/channels data
 *   5. Fastify server boots and serves /health with status "ok"
 */

import { describe, it, expect, afterAll } from "vitest";
import { Pool } from "pg";
import Redis from "ioredis";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";

// Use the same DATABASE_URL from .env (already loaded by config.ts)
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5433/reznetai_local";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

// ---------------------------------------------------------------------------
// Test 1: Config validation
// ---------------------------------------------------------------------------

describe("Config", () => {
  it("loads and validates settings from .env", async () => {
    const { settings } = await import("../config.js");

    expect(settings.DATABASE_URL).toBeTruthy();
    expect(settings.REDIS_URL).toBeTruthy();
    expect(settings.BACKEND_PORT).toBeTypeOf("number");
    expect(settings.BACKEND_HOST).toBeTruthy();
    expect(settings.DEFAULT_LLM_PROVIDER).toBeTruthy();
    expect(settings.CORS_ORIGINS).toBeInstanceOf(Array);
    expect(settings.MCP_FILESYSTEM_WORKSPACE).toBeTruthy();
    // Boolean coercion
    expect(settings.DEBUG).toBeTypeOf("boolean");
    expect(settings.AUTH_ENABLED).toBeTypeOf("boolean");
  });
});

// ---------------------------------------------------------------------------
// Test 2: PostgreSQL connection + health check
// ---------------------------------------------------------------------------

describe("PostgreSQL", () => {
  let pool: Pool;

  afterAll(async () => {
    await pool?.end();
  });

  it("connects and responds to SELECT 1", async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    const result = await pool.query("SELECT 1 AS ok");
    expect(result.rows[0].ok).toBe(1);
  });

  it("has pgvector extension installed", async () => {
    pool = pool ?? new Pool({ connectionString: DATABASE_URL });
    const result = await pool.query(
      "SELECT extname FROM pg_extension WHERE extname = 'vector'"
    );
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].extname).toBe("vector");
  });

  it("has all 10 expected tables", async () => {
    pool = pool ?? new Pool({ connectionString: DATABASE_URL });
    const result = await pool.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
    );
    const tables = result.rows.map(
      (r: { tablename: string }) => r.tablename
    );
    expect(tables).toContain("agents");
    expect(tables).toContain("channels");
    expect(tables).toContain("messages");
    expect(tables).toContain("tasks");
    expect(tables).toContain("agent_memories");
    expect(tables).toContain("workflows");
    expect(tables).toContain("workflow_tasks");
    expect(tables).toContain("uploaded_files");
    expect(tables).toContain("agent_templates");
    expect(tables).toContain("workspace");
  });
});

// ---------------------------------------------------------------------------
// Test 3: Redis connection
// ---------------------------------------------------------------------------

describe("Redis", () => {
  let redis: Redis;

  afterAll(async () => {
    await redis?.quit();
  });

  it("connects and responds to PING", async () => {
    redis = new Redis(REDIS_URL);
    const reply = await redis.ping();
    expect(reply).toBe("PONG");
  });

  it("can SET and GET a key", async () => {
    redis = redis ?? new Redis(REDIS_URL);
    await redis.set("reznet:test:phase1", "ok");
    const value = await redis.get("reznet:test:phase1");
    expect(value).toBe("ok");
    await redis.del("reznet:test:phase1");
  });
});

// ---------------------------------------------------------------------------
// Test 4: Drizzle ORM reads existing data
// ---------------------------------------------------------------------------

describe("Drizzle ORM", () => {
  let pool: Pool;

  afterAll(async () => {
    await pool?.end();
  });

  it("reads agents from the database", async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    const db = drizzle(pool, { schema });

    const agents = await db.select().from(schema.agents);
    expect(agents.length).toBeGreaterThanOrEqual(5);

    const names = agents.map((a) => a.name);
    expect(names).toContain("orchestrator");
    expect(names).toContain("backend");
    expect(names).toContain("frontend");
    expect(names).toContain("qa");
    expect(names).toContain("devops");
  });

  it("reads channels from the database", async () => {
    pool = pool ?? new Pool({ connectionString: DATABASE_URL });
    const db = drizzle(pool, { schema });

    const channels = await db.select().from(schema.channels);
    expect(channels.length).toBeGreaterThanOrEqual(1);

    const names = channels.map((c) => c.name);
    expect(names).toContain("general");
  });

  it("reads workspace from the database", async () => {
    pool = pool ?? new Pool({ connectionString: DATABASE_URL });
    const db = drizzle(pool, { schema });

    const workspaces = await db.select().from(schema.workspace);
    expect(workspaces.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Test 5: Health endpoint
// ---------------------------------------------------------------------------

describe("Health Endpoint", () => {
  let serverProcess: import("child_process").ChildProcess | undefined;
  const TEST_PORT = 18321; // high port to avoid conflicts

  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill("SIGTERM");
      // Give it a moment to shut down
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  });

  it("boots and returns health status ok", async () => {
    const { spawn } = await import("child_process");

    // Start server on a test port
    serverProcess = spawn(
      "npx",
      ["tsx", "src/index.ts"],
      {
        cwd: "/home/wonworld/projects/reznet-ai/backend-ts",
        env: {
          ...process.env,
          BACKEND_PORT: String(TEST_PORT),
          BACKEND_HOST: "127.0.0.1",
          LOG_LEVEL: "error", // quiet during tests
        },
        stdio: ["pipe", "pipe", "pipe"],
      }
    );

    // Wait for server to start by polling the health endpoint
    let healthy = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      try {
        const response = await fetch(`http://127.0.0.1:${TEST_PORT}/health`);
        if (response.ok) {
          const data = await response.json();
          expect(data.status).toBe("ok");
          expect(data.postgres).toBe(true);
          expect(data.redis).toBe(true);
          expect(data.version).toBe("2.0.0");
          expect(data.uptime).toBeGreaterThan(0);
          healthy = true;
          break;
        }
      } catch {
        // Server not ready yet, retry
      }
    }

    expect(healthy).toBe(true);
  });

  it("root endpoint returns service info", async () => {
    const response = await fetch(`http://127.0.0.1:${TEST_PORT}/`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data.service).toBe("RezNet AI");
    expect(data.version).toBe("2.0.0");
    expect(data.status).toBe("running");
  });
});
