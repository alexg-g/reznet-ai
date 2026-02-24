# Plan: Rewrite RezNet AI Backend in TypeScript on Pi Primitives

## Context

RezNet AI is a pre-launch, developer-only MVP with no production users. The backend is Python/FastAPI (~12,000 LOC) with a custom multi-agent orchestration system, Socket.IO WebSocket layer, and a hand-rolled LLM client supporting 3 providers. The goal is to rewrite the backend in TypeScript using [pi-mono](https://github.com/badlogic/pi-mono) packages (pi-ai for LLM abstraction, pi-agent-core for agent runtime) to improve long-term viability, expand capabilities, and unify the stack with the Next.js frontend.

**Why now:** The product has no users and no migration constraints. This is the lowest-cost window for a foundational architecture change.

### What Pi Provides

- **pi-ai**: Unified LLM API for 20+ providers (Anthropic, OpenAI, Google, Ollama, Groq, OpenRouter, Bedrock, etc.) with built-in token/cost tracking and streaming
- **pi-agent-core**: Agent runtime with tool calling loop, context compaction, and streaming -- serves as the foundation for each specialist agent instance

> **Multi-agent model (clarification):** Pi's Agent class is single-threaded per instance (one prompt at a time per agent). For multi-agent orchestration, we instantiate separate Agent objects per specialist (one for @backend, one for @frontend, etc.) and run them concurrently via `Promise.all()`. This is architecturally identical to the current Python approach where each BaseAgent instance runs independently via `asyncio.gather()`. Sub-agent delegation works by having one agent's output trigger another agent instance.

---

## Architecture: Before vs After

```
CURRENT (Python, ~12,000 LOC)
Frontend (Next.js/TS) <--Socket.IO--> Backend (FastAPI/Python)
 ├── LLMClient (3 providers, 710 LOC)
 ├── BaseAgent + 5 specialists
 ├── WorkflowOrchestrator (DAG)
 ├── SemanticMemoryManager (pgvector)
 ├── MCPFilesystemClient
 ├── ErrorHandling (retry, fallback)
 └── SQLAlchemy models (PostgreSQL)

PROPOSED (TypeScript)
Frontend (Next.js/TS) <--Socket.IO--> Backend (Fastify/TS)
 ├── pi-ai (20+ LLM providers, native)
 ├── pi-agent-core Agent instances × 5
 ├── WorkflowEngine (DAG, Promise.all)
 ├── SemanticMemoryManager (pgvector npm)
 ├── Pi built-in tools + MCP extensions
 ├── ErrorHandling (rebuilt, wraps pi-ai)
 └── Drizzle ORM models (PostgreSQL)
```

---

## Implementation Plan (8 Phases)

Realistic timeline: 10-14 weeks for a single developer. No parallel Python maintenance -- the Python backend is the reference implementation, not a live system.

### Phase 1: TypeScript Backend Scaffold (Week 1-2)

**Goal:** Bootable TS backend connected to existing PostgreSQL/Redis.

**New directory:** `/backend-ts/`

| New File | Purpose | Replaces |
|----------|---------|----------|
| `package.json` | Deps: fastify, socket.io, drizzle-orm, pg, @mariozechner/pi-ai, @mariozechner/pi-agent-core, pgvector, ioredis, zod | `requirements.txt` |
| `src/index.ts` | Fastify + Socket.IO entry point | `backend/main.py` (571 LOC) |
| `src/config.ts` | Zod-validated env config | `backend/core/config.py` (98 LOC) |
| `src/db/schema.ts` | Drizzle schema (10 models, 16+ indexes, JSONB, Vector columns) | `backend/models/database.py` (~400 LOC) |
| `src/db/connection.ts` | PostgreSQL pool + Redis client | Spread across `main.py` |
| `vitest.config.ts` | Test configuration | `tests/conftest.py` |

**Key concern (from red team):** Database migration. The PostgreSQL schema stays the same -- Drizzle reads from the same tables SQLAlchemy created. No data migration needed. Drizzle's introspect command can generate the schema from the existing database. Alembic migrations are not needed since there's no production data to preserve.

**Validation:** `npm run dev` boots, connects to PostgreSQL, reads existing channel/agent data, serves `/health`.

### Phase 2: LLM Layer -- pi-ai Integration (Week 2-3)

**Goal:** Replace the 710-line hand-rolled LLMClient with pi-ai.

| New File | Purpose | Replaces |
|----------|---------|----------|
| `src/llm/client.ts` | Thin wrapper around pi-ai | `backend/agents/llm_client.py` (710 LOC) |
| `src/llm/error-handling.ts` | Retry, fallback, error classification wrapping pi-ai | `backend/core/error_handling.py` (327 LOC) |

**What pi-ai eliminates:**

- `_init_anthropic()`, `_init_openai()`, `_init_ollama()` -- replaced by `getModel(provider, modelId)`
- `_generate_anthropic()`, `_generate_openai()`, `_generate_ollama()` -- replaced by `generateText()`
- `_stream_anthropic()`, `_stream_openai()`, `_stream_ollama()` -- replaced by `streamText()`
- Per-provider response format normalization -- pi-ai handles this

**What we rebuild on top of pi-ai:**

- Multi-provider fallback chain (current `_try_fallback_providers()` at `llm_client.py:140-198`)
- Exponential backoff retry (current `@retry_with_exponential_backoff` decorator)
- Structured error classification and logging

**Key concern (from red team):** Pi's error handling is thin. We wrap pi-ai calls in our own retry/fallback layer. Pi provides the unified LLM interface; we provide the resilience.

**Validation:** Call Anthropic, OpenAI, Ollama, and at least one new provider (Google Gemini) through pi-ai. Verify streaming works. Test fallback when primary provider fails.

### Phase 3: Agent Runtime -- pi-agent-core (Week 3-5)

**Goal:** Each specialist agent is a pi-agent-core Agent instance with custom system prompt, tools, and memory integration.

| New File | Purpose | Replaces |
|----------|---------|----------|
| `src/agents/base-agent.ts` | RezNet agent wrapper around Pi's Agent class | `backend/agents/base.py` (560 LOC) + `base_with_memory.py` (260 LOC) |
| `src/agents/specialists.ts` | 5 specialist definitions (persona, tools, model) | `backend/agents/specialists.py` (257 LOC) |
| `src/agents/tools/filesystem.ts` | File tools using Pi's built-in read/write/edit | `backend/agents/tool_schemas.py` (377 LOC) + `mcp_client.py` (334 LOC) |
| `src/agents/tools/delegation.ts` | @mention parsing + agent delegation tool | Part of `processor.py` |

**Multi-agent concurrency model:**

```typescript
// Each specialist is its own Agent instance
const agents = {
  backend:      new RezNetAgent({ model: getModel('anthropic', 'claude-sonnet-4-20250514'), persona: backendPersona, tools: backendTools }),
  frontend:     new RezNetAgent({ model: getModel('anthropic', 'claude-sonnet-4-20250514'), persona: frontendPersona, tools: frontendTools }),
  qa:           new RezNetAgent({ model: getModel('groq', 'llama-3.1-70b'), persona: qaPersona, tools: qaTools }),
  devops:       new RezNetAgent({ model: getModel('openai', 'gpt-4o'), persona: devopsPersona, tools: devopsTools }),
  orchestrator: new RezNetAgent({ model: getModel('anthropic', 'claude-sonnet-4-20250514'), persona: orchestratorPersona, tools: orchestratorTools }),
};

// Parallel execution -- each Agent instance is independent
const results = await Promise.all(
  readyTasks.map(task => agents[task.agentType].processMessage(task.description, task.context))
);
```

**Memory integration via Pi's context transform hooks:**

```typescript
class RezNetAgent {
  constructor(opts) {
    this.piAgent = new Agent({
      ...opts,
      contextTransform: async (messages) => {
        const memories = await this.memoryManager.retrieveRelevant(messages);
        return [...memories.map(m => ({ role: 'system', content: m.content })), ...messages];
      }
    });
  }
}
```

**Tool sandboxing (from red team concern):** Pi's bash tool gives unrestricted shell access. For Phase 1, constrain via a custom tool wrapper that limits commands to the workspace directory. Add proper sandboxing (Docker exec, seccomp) in a later phase if needed.

**Validation:** Send a message to @backend, verify it responds via Claude, executes file tools, streams response chunks.

### Phase 4: WebSocket + Message Routing (Week 5-7)

**Goal:** Rebuild Socket.IO layer and message processing pipeline.

| New File | Purpose | Replaces |
|----------|---------|----------|
| `src/websocket/manager.ts` | Connection manager, payload optimization, batching | `backend/websocket/manager.py` (~606 LOC) |
| `src/websocket/handlers.ts` | Event handlers (message_send, agent_invoke, etc.) | Part of `manager.py` |
| `src/agents/processor.ts` | @mention parsing, agent routing, streaming relay, recursive delegation | `backend/agents/processor.py` (686 LOC) |

**Events preserved (same contract with frontend):**

- `message_send`, `message_new`, `message_stream`, `message_update`
- `agent_status`, `agent_typing`, `typing_start`
- `workflow:*` events (created, started, task_started, task_completed, progress, completed, failed)

**Payload optimization:** Port the existing PayloadOptimizer (field abbreviation, gzip compression) and MessageBatcher (50ms batching window) logic directly -- these are algorithm-level, not language-dependent.

**Validation:** Frontend connects unchanged, sends message, sees streaming agent response, typing indicators, and status updates.

### Phase 5: Workflow Orchestration Engine (Week 7-9)

**Goal:** Rebuild multi-agent DAG workflow system.

| New File | Purpose | Replaces |
|----------|---------|----------|
| `src/workflows/engine.ts` | Workflow lifecycle, DAG resolution, parallel execution | `backend/agents/workflow_orchestrator.py` (743 LOC) |
| `src/workflows/types.ts` | Workflow, WorkflowTask types | Part of models |
| `src/workflows/parser.ts` | Plan parsing (regex: `Task N: @agent - Description (depends on...)`) | Part of orchestrator |

**DAG execution pattern:**

```typescript
while (incompleteTasks.length > 0) {
  const ready = getReadyTasks(workflow); // deps satisfied
  const results = await Promise.all(
    ready.map(task => executeTask(task, workflow))
  );
  // Update completed tasks, broadcast progress, get next ready batch
}
```

**Validation:** "@orchestrator build a hello world API" -> plans 3 tasks -> @backend creates files -> @qa writes tests -> parallel tasks run concurrently -> workflow completes.

### Phase 6: Semantic Memory (Week 9-10)

**Goal:** Port pgvector semantic memory to TypeScript.

| New File | Purpose | Replaces |
|----------|---------|----------|
| `src/memory/manager.ts` | Store/retrieve memories, vector search, importance scoring | `backend/agents/memory_manager.py` (553 LOC) |
| `src/memory/embeddings.ts` | Embedding generation (via pi-ai or Ollama directly) | Part of `memory_manager` |

**Key concern (from red team):** Embedding support. Pi-ai focuses on chat/completion, not embeddings. For embedding generation, call Ollama's embedding endpoint directly via `fetch()` (same as current httpx approach) or use the OpenAI embedding API. The pgvector npm package handles vector storage and cosine similarity queries.

Existing vectors are preserved -- same embedding model (nomic-embed-text, 768 dims), same pgvector column, same cosine distance queries. No re-embedding needed.

**Validation:** Agent stores conversation in memory. New messages retrieve relevant past context via vector similarity.

### Phase 7: REST API Routes (Week 10-12)

**Goal:** Port all REST endpoints with same API contract.

| New File | Purpose | Replaces |
|----------|---------|----------|
| `src/routes/channels.ts` | Channel CRUD | `backend/routers/channels.py` |
| `src/routes/agents.ts` | Agent CRUD + templates | `backend/routers/agents.py` + `agent_templates.py` |
| `src/routes/messages.ts` | Message history, search | `backend/routers/messages.py` |
| `src/routes/workflows.ts` | Workflow CRUD + execution | `backend/routers/workflows.py` (322 LOC) |
| `src/routes/memories.ts` | Memory management | `backend/routers/memories.py` (318 LOC) |
| `src/routes/uploads.ts` | File uploads | `backend/routers/uploads.py` (300 LOC) |
| `src/routes/health.ts` | Health + LLM config | `backend/routers/health.py` |

**API docs:** Use `@fastify/swagger` + `@fastify/swagger-ui` to maintain Swagger UI at `/docs` (preserving current developer experience at http://localhost:8000/docs).

**Validation:** All existing frontend API calls work against the new backend.

### Phase 8: Cutover + Cleanup (Week 12-14)

**Goal:** Switch to TypeScript backend, archive Python backend.

**Steps:**

1. End-to-end smoke test: full workflow execution, memory retrieval, all WebSocket events
2. Update `docker-compose.yml` -- add backend-ts service, remove Python backend
3. Update `scripts/start.sh`, `scripts/stop.sh`, `scripts/setup.sh`
4. Update `.env.example` with any new config keys
5. Move `backend/` -> `backend-python-archive/` (keep for reference during stabilization)
6. Update `CLAUDE.md` to reflect new architecture
7. Update `README.md` setup instructions
8. Update PRD technology stack section

**Exit criteria:** Frontend works identically. All WebSocket events fire. Workflows complete. Memory retrieves context. No Python processes running.

---

## Risk Mitigations (Incorporating Red Team + PM Feedback)

| Risk | Mitigation |
|------|------------|
| **Pi bus factor = 1** (Mario Zechner, 82.5% of commits) | Pin to specific version. Our wrapper layer (`src/llm/client.ts`, `src/agents/base-agent.ts`) isolates Pi internals -- if Pi is abandoned, we can swap to direct SDK calls without changing agent/workflow code. Consider forking if Pi stalls. |
| **Pi breaking changes** (213 releases in 6 months) | Pin `@mariozechner/pi-ai` and `@mariozechner/pi-agent-core` to exact versions in `package.json`. Upgrade deliberately, not automatically. Add overrides in `package.json` to lock transitive deps. |
| **Scope is ~12,000 LOC, not 4,000** | Plan accounts for full scope across 8 phases. Timeline set at 10-14 weeks, not 4. No new features during migration -- focus entirely on parity. |
| **Error handling / fallback gaps** | Explicitly rebuild retry + fallback layer in `src/llm/error-handling.ts` wrapping pi-ai. This is Phase 2 scope. |
| **Database schema migration** | No migration needed -- Drizzle reads same PostgreSQL tables. Use `drizzle-kit introspect` to generate schema from existing DB. No Alembic dependency. |
| **Tool sandboxing regression** | Wrap Pi's bash tool with workspace-constrained executor. Block commands outside workspace dir. Add Docker-exec sandboxing later. |
| **Test coverage gaps** | Write tests alongside each phase using Vitest. Use the Python backend as the reference oracle -- compare outputs for the same inputs. |
| **Frontend API parity** | Fastify + Zod produces equivalent JSON. Use `@fastify/swagger` for Swagger UI. Run frontend against new backend throughout development. |
| **Pi "OSS Vacation" until March 2** | No blocker -- we pin to current version. We're consumers of the package, not contributors. |

---

## Verification Plan

| Phase | Validation |
|-------|------------|
| 1 | Backend boots, reads existing PostgreSQL data, serves `/health` |
| 2 | LLM calls work for Anthropic, OpenAI, Ollama + Google Gemini. Fallback chain works. |
| 3 | Single agent processes message, executes tools, streams response |
| 4 | Frontend sends message via WebSocket, receives streaming agent response |
| 5 | Multi-agent workflow runs with correct DAG ordering, parallel execution |
| 6 | Agent retrieves relevant memories from past conversations |
| 7 | All REST endpoints return correct data, frontend works end-to-end |
| 8 | Full smoke test: channel -> message -> workflow -> completion with file artifacts |

**End-to-end smoke test:** "@orchestrator build a hello world API" -> orchestrator plans tasks -> @backend creates files -> @qa writes tests -> workflow completes -> files exist in workspace.

---

## Key Files Reference

### Current Python (to port from)

- `backend/agents/llm_client.py` -- LLM abstraction (710 LOC)
- `backend/agents/base.py` -- BaseAgent class (560 LOC)
- `backend/agents/base_with_memory.py` -- Memory layer (260 LOC)
- `backend/agents/specialists.py` -- 5 specialist agents (257 LOC)
- `backend/agents/processor.py` -- Message processing pipeline (686 LOC)
- `backend/agents/workflow_orchestrator.py` -- DAG workflow engine (743 LOC)
- `backend/agents/memory_manager.py` -- Semantic memory (553 LOC)
- `backend/agents/mcp_client.py` -- MCP filesystem client (334 LOC)
- `backend/agents/tool_schemas.py` -- Tool definitions (377 LOC)
- `backend/websocket/manager.py` -- Socket.IO manager (606 LOC)
- `backend/core/config.py` -- Configuration (98 LOC)
- `backend/core/error_handling.py` -- Error handling (327 LOC)
- `backend/models/database.py` -- Database models (~400 LOC)
- `backend/routers/*.py` -- REST endpoints (~1,500 LOC total)

### New TypeScript (to create)

- `backend-ts/src/llm/client.ts` -- pi-ai wrapper
- `backend-ts/src/llm/error-handling.ts` -- Retry/fallback layer
- `backend-ts/src/agents/base-agent.ts` -- Pi Agent wrapper
- `backend-ts/src/agents/specialists.ts` -- 5 specialist definitions
- `backend-ts/src/agents/processor.ts` -- Message routing
- `backend-ts/src/agents/tools/*.ts` -- Tool definitions
- `backend-ts/src/workflows/engine.ts` -- DAG orchestrator
- `backend-ts/src/memory/manager.ts` -- Semantic memory
- `backend-ts/src/websocket/manager.ts` -- Socket.IO manager
- `backend-ts/src/routes/*.ts` -- REST endpoints
- `backend-ts/src/db/schema.ts` -- Drizzle ORM schema
- `backend-ts/src/config.ts` -- Zod-validated config
