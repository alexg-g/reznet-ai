# Sam-DB Persistent Memory

## Config Module Pattern (backend-ts/src/config.ts)

- Uses `zod` + `dotenv`. Both are already in package.json dependencies.
- .env path: `resolve(__dirname, "../../.env")` — two levels up from compiled `dist/src/`, which resolves to the project root. Uses `fileURLToPath(import.meta.url)` because the project is ESM (`"type": "module"`).
- `booleanString`: a reusable Zod helper that coerces "true"/"1"/"yes" -> `true`. Needed because `process.env` values are always strings.
- `commaSeparatedString`: coerces `"localhost,127.0.0.1"` -> `["localhost", "127.0.0.1"]`. Used for CORS_ORIGINS and ALLOWED_HOSTS.
- Numeric env vars (ports, timeouts, counts) use `z.coerce.number()` — required because `process.env` is always `string`.
- Required fields (no default): DATABASE_URL, REDIS_URL, MCP_FILESYSTEM_WORKSPACE. These throw at startup with a human-readable message listing all bad fields.
- `loadSettings()` uses `safeParse` + accumulates all issues before throwing — avoids fixing one error at a time.
- Exported singleton: `export const settings: Settings = loadSettings()`. Import as `import { settings } from "./config.js"`.
- `export type Settings = z.infer<typeof SettingsSchema>` gives other modules full type safety.
- LOG_LEVEL is an `z.enum` (not free-form string), matching Fastify's log level values: debug/info/warn/error/fatal/silent.

## LLM Providers (as of .env.example update 2026-02-23)

Four providers configured: Anthropic, OpenAI, Google (Gemini), Groq, + Ollama for local/embeddings.
- ANTHROPIC_DEFAULT_MODEL: claude-sonnet-4-20250514
- OPENAI_DEFAULT_MODEL: gpt-4o
- GOOGLE_DEFAULT_MODEL: gemini-2.0-flash
- GROQ_DEFAULT_MODEL: llama-3.1-70b-versatile
- OLLAMA_EMBEDDING_MODEL: nomic-embed-text (768 dims, same as Python backend)

## Drizzle ORM Schema (drizzle-orm 0.39.3)

- Schema at `/home/wonworld/projects/reznet-ai/backend-ts/src/db/schema.ts`
- Has native `vector()` type in `drizzle-orm/pg-core` -- do NOT use `customType` for pgvector
- Usage: `vector("embedding", { dimensions: 768 })`
- Self-referencing FK (e.g. messages.threadId): import `AnyPgColumn` from `drizzle-orm/pg-core` and use as return type: `.references((): AnyPgColumn => messages.id)`
- `$default<T>()` generic type param unsupported -- cast inside callback: `$default(() => [] as string[])`
- `msg_metadata` (Message) and `mem_metadata` (AgentMemory) map to DB column name `"metadata"`
- All JSONB defaults use `$default()` (application-side factory), not `.default()` (SQL literal)
- `uniqueIndex` import is unused -- `.unique()` on the column definition is sufficient
- `noUnusedLocals` is enforced -- always verify imports are actually used

### Table Name Mapping

| Python class    | DB table name    | Drizzle export    |
|-----------------|------------------|-------------------|
| Workspace       | workspace        | workspace         |
| Agent           | agents           | agents            |
| Channel         | channels         | channels          |
| Message         | messages         | messages          |
| Task            | tasks            | tasks             |
| AgentMemory     | agent_memories   | agentMemories     |
| Workflow        | workflows        | workflows         |
| WorkflowTask    | workflow_tasks   | workflowTasks     |
| UploadedFile    | uploaded_files   | uploadedFiles     |
| AgentTemplate   | agent_templates  | agentTemplates    |

## DB Connection Layer (backend-ts/src/db/connection.ts)

- Drizzle adapter: `drizzle-orm/node-postgres` (NOT neon/postgres.js) — used with `pg` Pool
- Pool config: `max: 10`, `idleTimeoutMillis: 30_000`, `connectionTimeoutMillis: 5_000`, `allowExitOnIdle: false`
- Query profiling: monkey-patch `pool.query` via `(pool as any).query = ...` BEFORE calling `drizzle(pool, { schema })`
- `pg` Pool.query is heavily overloaded — cast to a single broad type to avoid TS errors:
  `type AnyQuery = (q: string | { text?: string }, values?: unknown[]) => Promise<unknown>`
- Per-request context: `AsyncLocalStorage<QueryProfilingContext>` from `"async_hooks"` (replaces Python's `ContextVar`)
- Redis error handling: `retryStrategy` that returns `null` after N attempts stops reconnecting without crashing
- Health checks bypass the profiled wrapper by using the original pre-patch `_originalQuery` reference
- `closeConnections()` uses `Promise.allSettled` so pool.end() and redis.quit() both run even if one fails
- Exported: `pool`, `db`, `redis`, `profilingStorage`, `checkPostgresHealth`, `checkRedisHealth`, `closeConnections`

## Key File Locations

- Connection: `/home/wonworld/projects/reznet-ai/backend-ts/src/db/connection.ts`
- Schema: `/home/wonworld/projects/reznet-ai/backend-ts/src/db/schema.ts`
- Config: `/home/wonworld/projects/reznet-ai/backend-ts/src/config.ts`
- Python reference: `/home/wonworld/projects/reznet-ai/backend/core/config.py`
- Python models: `/home/wonworld/projects/reznet-ai/backend/models/database.py`
- .env.example: `/home/wonworld/projects/reznet-ai/.env.example`
- package.json: `/home/wonworld/projects/reznet-ai/backend-ts/package.json`
- tsconfig.json: `/home/wonworld/projects/reznet-ai/backend-ts/tsconfig.json`

## Fastify Server Entry Point (backend-ts/src/index.ts)

- Phase 1 scaffold complete. No pi-ai / pi-agent-core imports (Phase 2/3).
- Top-level `await` works because `"type": "module"` + `"module": "ESNext"` in tsconfig.
- **CORS**: register `@fastify/cors` plugin BEFORE `fastify.listen()`. Pass `settings.CORS_ORIGINS` (already a `string[]` from the commaSeparatedString Zod coercer).
- **Socket.IO**: instantiate AFTER `fastify.listen()` — `fastify.server` is the bound `http.Server` only after listen resolves. Pass same `CORS_ORIGINS` array.
- **Query profiling hook**: `profilingStorage.enterWith(ctx)` in `onRequest` hook (not `profilingStorage.run(ctx, fn)`) — Fastify doesn't wrap the full request lifecycle in a single async call, so `enterWith` is the only way to propagate the store across hook boundaries.
- **Module augmentation** for `FastifyRequest`: declare inside `declare module "fastify" { interface FastifyRequest { ... } }` — standard Fastify pattern for adding request-scoped properties.
- **Health endpoint**: `GET /health` returns `{ status, postgres, redis, uptime, version }`. HTTP 503 only when both are down ("unhealthy"). 200 for "ok" and "degraded".
- **Graceful shutdown**: single boolean guard `shuttingDown` prevents double-shutdown if both SIGINT and SIGTERM arrive. Calls `fastify.close()` then `closeConnections()`.
- **Banner**: `printBanner()` called before `fastify.listen()`. Access URLs printed after listen() resolves.

## Fastify Route Patterns

- Export: `export async function xyzRoutes(fastify: FastifyInstance): Promise<void>`
- Generic type params on route methods: `fastify.get<{ Params: ...; Querystring: ...; Body: ... }>()`
- Route registration order: register static-segment routes BEFORE wildcard routes.
  Example: `/upload/message/:messageId` BEFORE `/upload/:fileId`
  Example: `/agent-templates/name/:name` BEFORE `/agent-templates/:id`
- JSONB filter with `->>`operator: `sql\`${table.jsonbCol}->>'key' = ${value}\``
- `pool` is exported from `connection.ts` for raw SQL needed in health checks (pgvector extension check)
- In-memory filtering after `.select()` is acceptable for small sets (template listing with domain/type filters)
- `findAgent()` helper pattern: inline async helper inside plugin scope avoids code duplication across endpoints

## Route Files (Phase 7)

- `/home/wonworld/projects/reznet-ai/backend-ts/src/routes/tasks.ts` — 6 endpoints, tasks table
- `/home/wonworld/projects/reznet-ai/backend-ts/src/routes/memories.ts` — 6 endpoints, agentMemories + SemanticMemoryManager
- `/home/wonworld/projects/reznet-ai/backend-ts/src/routes/uploads.ts` — 5 endpoints, uploadedFiles + fs/promises
- `/home/wonworld/projects/reznet-ai/backend-ts/src/routes/templates.ts` — 8 endpoints, agentTemplates + agents
- Existing: `agents.ts`, `channels.ts`

## TypeScript / ESM Notes

- Project is `"type": "module"` — use `import.meta.url` not `__filename/__dirname` directly (need fileURLToPath from "url").
- `noUnusedLocals` and `noUnusedParameters` are enabled — do not leave unreferenced imports.
- Import from `"path"` not `"node:path"` — both work but "path" is already the established pattern.
