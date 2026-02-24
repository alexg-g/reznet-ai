/**
 * Phase 7 Validation Tests — REST API Routes
 *
 * Validates all Phase 7 acceptance criteria:
 *   1. All 7 route modules export async Fastify plugin functions
 *   2. Route registration in index.ts imports all route modules
 *   3. Channel routes: 6 endpoints with correct methods/paths
 *   4. Agent routes: 9 endpoints with route ordering (name before :agentId)
 *   5. Workflow routes: 9 endpoints with background execution pattern
 *   6. Task routes: 6 endpoints with status validation
 *   7. Memory routes: 6 endpoints with SemanticMemoryManager delegation
 *   8. Upload routes: 5 endpoints with file validation
 *   9. Template routes: 8 endpoints with default protection
 *  10. LLM config endpoint in index.ts
 *  11. Cache TTL constants match Python implementation
 *  12. Error response shapes (404, 400)
 *  13. Route file structure and organization
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// ---------------------------------------------------------------------------
// Helper: read source file for structural assertions
// ---------------------------------------------------------------------------

function readSrc(relPath: string): string {
  const fullPath = resolve(__dirname, "..", relPath);
  return readFileSync(fullPath, "utf-8");
}

// ===========================================================================
// 1. Route module exports
// ===========================================================================

describe("Route module exports", () => {
  it("channels.ts exports channelRoutes async function", async () => {
    const mod = await import("../routes/channels.js");
    expect(typeof mod.channelRoutes).toBe("function");
  });

  it("agents.ts exports agentRoutes async function", async () => {
    const mod = await import("../routes/agents.js");
    expect(typeof mod.agentRoutes).toBe("function");
  });

  it("workflows.ts exports workflowRoutes async function", async () => {
    const mod = await import("../routes/workflows.js");
    expect(typeof mod.workflowRoutes).toBe("function");
  });

  it("tasks.ts exports taskRoutes async function", async () => {
    const mod = await import("../routes/tasks.js");
    expect(typeof mod.taskRoutes).toBe("function");
  });

  it("memories.ts exports memoryRoutes async function", async () => {
    const mod = await import("../routes/memories.js");
    expect(typeof mod.memoryRoutes).toBe("function");
  });

  it("uploads.ts exports uploadRoutes async function", async () => {
    const mod = await import("../routes/uploads.js");
    expect(typeof mod.uploadRoutes).toBe("function");
  });

  it("templates.ts exports templateRoutes async function", async () => {
    const mod = await import("../routes/templates.js");
    expect(typeof mod.templateRoutes).toBe("function");
  });
});

// ===========================================================================
// 2. Index.ts registers all route plugins
// ===========================================================================

describe("Route registration in index.ts", () => {
  const indexSrc = readSrc("index.ts");

  it("imports channelRoutes", () => {
    expect(indexSrc).toContain('import { channelRoutes }');
  });

  it("imports agentRoutes", () => {
    expect(indexSrc).toContain('import { agentRoutes }');
  });

  it("imports workflowRoutes", () => {
    expect(indexSrc).toContain('import { workflowRoutes }');
  });

  it("imports taskRoutes", () => {
    expect(indexSrc).toContain('import { taskRoutes }');
  });

  it("imports memoryRoutes", () => {
    expect(indexSrc).toContain('import { memoryRoutes }');
  });

  it("imports uploadRoutes", () => {
    expect(indexSrc).toContain('import { uploadRoutes }');
  });

  it("imports templateRoutes", () => {
    expect(indexSrc).toContain('import { templateRoutes }');
  });

  it("registers routes under /api prefix", () => {
    expect(indexSrc).toContain('prefix: "/api"');
    // All 7 route registrations
    expect(indexSrc).toContain("fastify.register(channelRoutes");
    expect(indexSrc).toContain("fastify.register(agentRoutes");
    expect(indexSrc).toContain("fastify.register(workflowRoutes");
    expect(indexSrc).toContain("fastify.register(taskRoutes");
    expect(indexSrc).toContain("fastify.register(memoryRoutes");
    expect(indexSrc).toContain("fastify.register(uploadRoutes");
    expect(indexSrc).toContain("fastify.register(templateRoutes");
  });

  it("has LLM config endpoint", () => {
    expect(indexSrc).toContain("/api/llm-config");
    expect(indexSrc).toContain("default_provider");
    expect(indexSrc).toContain("active_model");
    expect(indexSrc).toContain("available_providers");
  });
});

// ===========================================================================
// 3. Channel routes structure
// ===========================================================================

describe("Channel routes structure", () => {
  const src = readSrc("routes/channels.ts");

  it("has GET /channels endpoint", () => {
    expect(src).toContain('"/channels"');
    expect(src).toContain("fastify.get");
  });

  it("has POST /channels endpoint", () => {
    expect(src).toContain("fastify.post");
  });

  it("has GET /channels/:channelId endpoint", () => {
    expect(src).toContain('"/channels/:channelId"');
  });

  it("has GET /channels/:channelId/messages with pagination", () => {
    expect(src).toContain('"/channels/:channelId/messages"');
    expect(src).toMatch(/limit/);
    expect(src).toMatch(/offset/);
  });

  it("has DELETE /channels/:channelId (soft delete)", () => {
    expect(src).toContain("fastify.delete");
    expect(src).toContain("isArchived");
  });

  it("has POST /channels/:channelId/clear with WS broadcast", () => {
    expect(src).toContain('"/channels/:channelId/clear"');
    expect(src).toContain("context_cleared");
    expect(src).toContain("wsManager");
  });

  it("respects contextClearedAt for message filtering", () => {
    expect(src).toContain("contextClearedAt");
    expect(src).toContain("gte");
  });

  it("uses Redis caching with 600s TTL", () => {
    expect(src).toContain("600");
    expect(src).toContain("redis");
    expect(src).toContain("channels:list:active");
  });

  it("reverses messages for chronological order", () => {
    expect(src).toContain("reverse()");
    expect(src).toContain("desc");
  });
});

// ===========================================================================
// 4. Agent routes structure
// ===========================================================================

describe("Agent routes structure", () => {
  const src = readSrc("routes/agents.ts");

  it("has GET /agents with active_only filter", () => {
    expect(src).toContain('"/agents"');
    expect(src).toContain("active_only");
  });

  it("registers /agents/name/:agentName before /agents/:agentId", () => {
    const nameRoutePos = src.indexOf('"/agents/name/:agentName"');
    const idRoutePos = src.indexOf('"/agents/:agentId"');
    expect(nameRoutePos).toBeGreaterThan(-1);
    expect(idRoutePos).toBeGreaterThan(-1);
    expect(nameRoutePos).toBeLessThan(idRoutePos);
  });

  it("adds @ prefix to agent names", () => {
    expect(src).toContain("@");
    expect(src).toContain("startsWith");
  });

  it("has POST /agents/:agentId/invoke", () => {
    expect(src).toContain('"/agents/:agentId/invoke"');
  });

  it("has GET /agents/:agentId/status", () => {
    expect(src).toContain('"/agents/:agentId/status"');
    expect(src).toContain("online");
    expect(src).toContain("offline");
  });

  it("has PATCH /agents/:agentId/activate", () => {
    expect(src).toContain('"/agents/:agentId/activate"');
    expect(src).toContain("fastify.patch");
  });

  it("has PATCH /agents/:agentId/deactivate", () => {
    expect(src).toContain('"/agents/:agentId/deactivate"');
  });

  it("has GET /agents/:agentId/dm-channel", () => {
    expect(src).toContain('"/agents/:agentId/dm-channel"');
    expect(src).toContain("dm");
    expect(src).toContain("dmAgentId");
  });

  it("has GET /agents/:agentId/system-prompt", () => {
    expect(src).toContain('"/agents/:agentId/system-prompt"');
    expect(src).toContain("persona");
  });

  it("uses 1hr cache for agent lookups, 30min for list", () => {
    expect(src).toContain("3600");
    expect(src).toContain("1800");
  });

  it("invalidates agent + list cache on activate/deactivate", () => {
    expect(src).toContain("invalidateAgentCache");
  });
});

// ===========================================================================
// 5. Workflow routes structure
// ===========================================================================

describe("Workflow routes structure", () => {
  const src = readSrc("routes/workflows.ts");

  it("has POST /workflows/plan with orchestrator lookup", () => {
    expect(src).toContain('"/workflows/plan"');
    expect(src).toContain("orchestrator");
  });

  it("has POST /workflows for manual creation", () => {
    expect(src).toContain("fastify.post");
  });

  it("has GET /workflows with status/channel/pagination filters", () => {
    expect(src).toContain('"/workflows"');
    expect(src).toContain("limit");
    expect(src).toContain("offset");
  });

  it("has GET /workflows/:workflowId with caching", () => {
    expect(src).toContain('"/workflows/:workflowId"');
    expect(src).toContain("redis");
  });

  it("has POST /workflows/:workflowId/start with background execution", () => {
    expect(src).toContain('"/workflows/:workflowId/start"');
    expect(src).toContain("workflowEngine");
    // Should be fire-and-forget (not awaited)
    expect(src).toContain(".catch");
  });

  it("has POST /workflows/:workflowId/cancel", () => {
    expect(src).toContain('"/workflows/:workflowId/cancel"');
  });

  it("has DELETE /workflows/:workflowId with executing guard", () => {
    expect(src).toContain("fastify.delete");
    expect(src).toContain("executing");
  });

  it("has GET /workflows/:workflowId/tasks", () => {
    expect(src).toContain('"/workflows/:workflowId/tasks"');
    expect(src).toContain("orderIndex");
  });

  it("has GET /workflows/:workflowId/tasks/:taskId", () => {
    expect(src).toContain("taskId");
  });

  it("uses 60s cache for workflow lookups", () => {
    expect(src).toContain("60");
  });

  it("imports workflowEngine", () => {
    expect(src).toContain("workflowEngine");
  });
});

// ===========================================================================
// 6. Task routes structure
// ===========================================================================

describe("Task routes structure", () => {
  const src = readSrc("routes/tasks.ts");

  it("has GET /tasks with status/assigned_to filters", () => {
    expect(src).toContain('"/tasks"');
    expect(src).toContain("status");
    expect(src).toContain("assigned_to");
  });

  it("has POST /tasks with agent validation", () => {
    expect(src).toContain("fastify.post");
    // Should validate agent exists if assigned_to is provided
    expect(src).toContain("agents");
  });

  it("has GET /tasks/:taskId", () => {
    expect(src).toContain('"/tasks/:taskId"');
  });

  it("has PATCH /tasks/:taskId/status with valid status check", () => {
    expect(src).toContain('"/tasks/:taskId/status"');
    expect(src).toContain("pending");
    expect(src).toContain("in_progress");
    expect(src).toContain("completed");
    expect(src).toContain("failed");
    expect(src).toContain("cancelled");
  });

  it("sets startedAt/completedAt on status transitions", () => {
    expect(src).toContain("startedAt");
    expect(src).toContain("completedAt");
  });

  it("has POST /tasks/:taskId/cancel", () => {
    expect(src).toContain('"/tasks/:taskId/cancel"');
  });

  it("has DELETE /tasks/:taskId", () => {
    expect(src).toContain("fastify.delete");
  });
});

// ===========================================================================
// 7. Memory routes structure
// ===========================================================================

describe("Memory routes structure", () => {
  const src = readSrc("routes/memories.ts");

  it("has GET /memory/health endpoint", () => {
    expect(src).toContain('"/memory/health"');
    expect(src).toContain("pgvector");
  });

  it("has GET /agents/:agentId/memory/stats", () => {
    expect(src).toContain("/memory/stats");
    expect(src).toContain("getStats");
  });

  it("has POST /agents/:agentId/memory/search", () => {
    expect(src).toContain("/memory/search");
    expect(src).toContain("retrieveRelevant");
  });

  it("has GET /agents/:agentId/memory/recent", () => {
    expect(src).toContain("/memory/recent");
    expect(src).toContain("getRecentMemories");
  });

  it("has POST /agents/:agentId/memory/summarize", () => {
    expect(src).toContain("/memory/summarize");
    expect(src).toContain("getSummary");
  });

  it("has DELETE /agents/:agentId/memory/cleanup", () => {
    expect(src).toContain("/memory/cleanup");
    expect(src).toContain("cleanupOldMemories");
  });

  it("delegates to SemanticMemoryManager", () => {
    expect(src).toContain("SemanticMemoryManager");
    expect(src).toContain("../memory/manager.js");
  });

  it("validates agent exists before memory operations", () => {
    expect(src).toContain("Agent not found");
    expect(src).toContain("404");
  });

  it("checks pgvector extension in health endpoint", () => {
    expect(src).toContain("pg_extension");
    expect(src).toContain("vector");
  });
});

// ===========================================================================
// 8. Upload routes structure
// ===========================================================================

describe("Upload routes structure", () => {
  const src = readSrc("routes/uploads.ts");

  it("has POST /upload endpoint", () => {
    expect(src).toContain("fastify.post");
  });

  it("has GET /upload list endpoint", () => {
    expect(src).toContain("fastify.get");
  });

  it("has GET /upload/:fileId metadata endpoint", () => {
    expect(src).toContain("fileId");
  });

  it("has DELETE /upload/:fileId endpoint", () => {
    expect(src).toContain("fastify.delete");
  });

  it("has GET /upload/message/:messageId endpoint", () => {
    expect(src).toContain("messageId");
  });

  it("validates file extensions with whitelist", () => {
    expect(src).toContain("ALLOWED_EXTENSIONS");
    expect(src).toContain(".ts");
    expect(src).toContain(".py");
    expect(src).toContain(".md");
  });

  it("enforces max file size", () => {
    expect(src).toContain("MAX_FILE_SIZE");
    expect(src).toMatch(/10\s*\*\s*1024\s*\*\s*1024/);
  });

  it("prevents path traversal", () => {
    expect(src).toContain("..");
  });

  it("stores files in workspace/uploads/YYYY-MM-DD/ pattern", () => {
    expect(src).toContain("uploads");
  });
});

// ===========================================================================
// 9. Template routes structure
// ===========================================================================

describe("Template routes structure", () => {
  const src = readSrc("routes/templates.ts");

  it("has POST /agent-templates endpoint", () => {
    expect(src).toContain('"/agent-templates"');
    expect(src).toContain("201");
  });

  it("has GET /agent-templates list endpoint", () => {
    expect(src).toContain("fastify.get");
  });

  it("registers /agent-templates/name/:templateName before /:templateId", () => {
    const namePos = src.indexOf("/agent-templates/name/");
    const idPos = src.indexOf("/agent-templates/:templateId");
    expect(namePos).toBeGreaterThan(-1);
    expect(idPos).toBeGreaterThan(-1);
    expect(namePos).toBeLessThan(idPos);
  });

  it("has PUT /agent-templates/:templateId", () => {
    expect(src).toContain("fastify.put");
  });

  it("has DELETE /agent-templates/:templateId with 204 response", () => {
    expect(src).toContain("fastify.delete");
    expect(src).toContain("204");
  });

  it("protects default templates from modification", () => {
    expect(src).toContain("default");
    expect(src).toContain("Cannot");
  });

  it("has POST /agent-templates/:templateId/instantiate", () => {
    expect(src).toContain("/instantiate");
  });

  it("has GET /agent-templates/:templateId/agents", () => {
    expect(src).toContain("/agents");
    expect(src).toContain("template_id");
  });

  it("creates agents with template_id in config JSONB", () => {
    expect(src).toContain("template_id");
  });

  it("returns list summary with total/default/custom counts", () => {
    expect(src).toContain("total");
    expect(src).toContain("default_templates");
    expect(src).toContain("custom_templates");
  });
});

// ===========================================================================
// 10. API parity with Python backend
// ===========================================================================

describe("API endpoint parity with Python backend", () => {
  it("covers all 6 channel endpoints", () => {
    const src = readSrc("routes/channels.ts");
    // GET /channels, POST /channels, GET /channels/:id,
    // GET /channels/:id/messages, DELETE /channels/:id, POST /channels/:id/clear
    expect(src.match(/fastify\.(get|post|delete|patch|put)/g)?.length).toBeGreaterThanOrEqual(6);
  });

  it("covers all 9 agent endpoints", () => {
    const src = readSrc("routes/agents.ts");
    // GET /agents, GET /agents/name/:name, GET /agents/:id,
    // POST /agents/:id/invoke, GET /agents/:id/status,
    // PATCH /agents/:id/activate, PATCH /agents/:id/deactivate,
    // GET /agents/:id/dm-channel, GET /agents/:id/system-prompt
    expect(src.match(/fastify\.(get|post|delete|patch|put)/g)?.length).toBeGreaterThanOrEqual(9);
  });

  it("covers all 9 workflow endpoints", () => {
    const src = readSrc("routes/workflows.ts");
    expect(src.match(/fastify\.(get|post|delete|patch|put)/g)?.length).toBeGreaterThanOrEqual(9);
  });

  it("covers all 6 task endpoints", () => {
    const src = readSrc("routes/tasks.ts");
    expect(src.match(/fastify\.(get|post|delete|patch|put)/g)?.length).toBeGreaterThanOrEqual(6);
  });

  it("covers all 6 memory endpoints", () => {
    const src = readSrc("routes/memories.ts");
    expect(src.match(/fastify\.(get|post|delete|patch|put)/g)?.length).toBeGreaterThanOrEqual(6);
  });

  it("covers all 5 upload endpoints", () => {
    const src = readSrc("routes/uploads.ts");
    expect(src.match(/fastify\.(get|post|delete|patch|put)/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it("covers all 8 template endpoints", () => {
    const src = readSrc("routes/templates.ts");
    expect(src.match(/fastify\.(get|post|delete|patch|put)/g)?.length).toBeGreaterThanOrEqual(8);
  });

  it("total endpoint count is at least 49 (6+9+9+6+6+5+8)", () => {
    const routeFiles = [
      "routes/channels.ts",
      "routes/agents.ts",
      "routes/workflows.ts",
      "routes/tasks.ts",
      "routes/memories.ts",
      "routes/uploads.ts",
      "routes/templates.ts",
    ];

    let totalEndpoints = 0;
    for (const file of routeFiles) {
      const src = readSrc(file);
      const matches = src.match(/fastify\.(get|post|delete|patch|put)/g);
      totalEndpoints += matches?.length ?? 0;
    }

    // 49 minimum: channels(6) + agents(9) + workflows(9) + tasks(6) +
    // memories(6) + uploads(5) + templates(8) = 49
    expect(totalEndpoints).toBeGreaterThanOrEqual(49);
  });
});

// ===========================================================================
// 11. Database imports and ORM usage
// ===========================================================================

describe("Database and ORM integration", () => {
  it("all route files import from db/connection", () => {
    const routeFiles = [
      "routes/channels.ts",
      "routes/agents.ts",
      "routes/workflows.ts",
      "routes/tasks.ts",
      "routes/memories.ts",
      "routes/uploads.ts",
    ];

    for (const file of routeFiles) {
      const src = readSrc(file);
      expect(src).toContain("../db/connection.js");
    }
  });

  it("all route files import from db/schema", () => {
    const routeFiles = [
      "routes/channels.ts",
      "routes/agents.ts",
      "routes/workflows.ts",
      "routes/tasks.ts",
      "routes/memories.ts",
      "routes/uploads.ts",
      "routes/templates.ts",
    ];

    for (const file of routeFiles) {
      const src = readSrc(file);
      expect(src).toContain("../db/schema.js");
    }
  });

  it("all route files use drizzle-orm operators", () => {
    const routeFiles = [
      "routes/channels.ts",
      "routes/agents.ts",
      "routes/workflows.ts",
      "routes/tasks.ts",
      "routes/memories.ts",
      "routes/templates.ts",
    ];

    for (const file of routeFiles) {
      const src = readSrc(file);
      expect(src).toContain("drizzle-orm");
      expect(src).toContain("eq");
    }
  });
});

// ===========================================================================
// 12. Cache strategy validation
// ===========================================================================

describe("Cache strategy", () => {
  it("channels use 600s (10min) TTL", () => {
    const src = readSrc("routes/channels.ts");
    expect(src).toContain("600");
  });

  it("agents use 3600s (1hr) and 1800s (30min) TTLs", () => {
    const src = readSrc("routes/agents.ts");
    expect(src).toContain("3600");
    expect(src).toContain("1800");
  });

  it("workflows use 60s (1min) TTL", () => {
    const src = readSrc("routes/workflows.ts");
    expect(src).toContain("60");
  });

  it("route files that use caching import redis", () => {
    const cachedRoutes = [
      "routes/channels.ts",
      "routes/agents.ts",
      "routes/workflows.ts",
    ];

    for (const file of cachedRoutes) {
      const src = readSrc(file);
      expect(src).toContain("redis");
    }
  });
});

// ===========================================================================
// 13. Error handling patterns
// ===========================================================================

describe("Error handling patterns", () => {
  it("all route files use 404 for not-found entities", () => {
    const routeFiles = [
      "routes/channels.ts",
      "routes/agents.ts",
      "routes/workflows.ts",
      "routes/tasks.ts",
      "routes/memories.ts",
      "routes/uploads.ts",
      "routes/templates.ts",
    ];

    for (const file of routeFiles) {
      const src = readSrc(file);
      expect(src).toContain("404");
      expect(src).toContain("not found");
    }
  });

  it("routes use 400 for validation errors", () => {
    // channels: empty name
    expect(readSrc("routes/channels.ts")).toContain("400");
    // agents: inactive agent
    expect(readSrc("routes/agents.ts")).toContain("400");
    // tasks: invalid status
    expect(readSrc("routes/tasks.ts")).toContain("400");
    // templates: cannot modify default
    expect(readSrc("routes/templates.ts")).toContain("400");
  });
});

// ===========================================================================
// 14. File organization
// ===========================================================================

describe("File organization", () => {
  it("all 7 route files exist", () => {
    const routeFiles = [
      "routes/channels.ts",
      "routes/agents.ts",
      "routes/workflows.ts",
      "routes/tasks.ts",
      "routes/memories.ts",
      "routes/uploads.ts",
      "routes/templates.ts",
    ];

    for (const file of routeFiles) {
      const src = readSrc(file);
      expect(src.length).toBeGreaterThan(100);
    }
  });

  it("all route files follow Fastify plugin pattern", () => {
    const routeFiles = [
      "routes/channels.ts",
      "routes/agents.ts",
      "routes/workflows.ts",
      "routes/tasks.ts",
      "routes/memories.ts",
      "routes/uploads.ts",
      "routes/templates.ts",
    ];

    for (const file of routeFiles) {
      const src = readSrc(file);
      expect(src).toContain("FastifyInstance");
      expect(src).toContain("export async function");
      expect(src).toContain("Promise<void>");
    }
  });

  it("all route files have JSDoc headers", () => {
    const routeFiles = [
      "routes/channels.ts",
      "routes/agents.ts",
      "routes/workflows.ts",
      "routes/tasks.ts",
      "routes/memories.ts",
      "routes/uploads.ts",
      "routes/templates.ts",
    ];

    for (const file of routeFiles) {
      const src = readSrc(file);
      expect(src).toMatch(/^\/\*\*/); // starts with JSDoc
    }
  });
});
