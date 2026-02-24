# CLAUDE.md - RezNet AI Project Context

> **Purpose**: This document provides foundational context for AI assistants and developers working on RezNet AI. It consolidates architectural decisions, design patterns, and essential project knowledge.

**Last Updated**: 2026-02-24
**Project Status**: TypeScript Backend (Migration Complete)
**Version**: 2.0.0

---

## For AI Assistants Working on This Project

### Context Summary

You are working on **RezNet AI**, a platform where users orchestrate teams of specialized AI agents to tackle complex work. The system is undergoing a **backend rewrite from Python/FastAPI to TypeScript/Fastify**, using [Pi](https://github.com/badlogic/pi-mono) packages for LLM abstraction and agent runtime.

**Current state:**
- Frontend: Next.js + TypeScript (unchanged, fully functional)
- Backend: TypeScript/Fastify (`/backend-ts`) — migration from Python complete
- 5 specialized AI agents (@orchestrator, @backend, @frontend, @qa, @devops)
- Multi-agent workflow orchestration (task dependencies, parallel execution, real-time progress)
- Real-time chat interface (Next.js + Socket.IO)
- Multi-LLM support via Pi (20+ providers: Anthropic, OpenAI, Google, Ollama, Groq, OpenRouter, Bedrock, etc.)
- MCP integration for tool access
- PostgreSQL + Redis data layer (unchanged)

**Why TypeScript:** Full-stack TypeScript unifies the stack with the Next.js frontend, provides access to 20+ LLM providers via Pi, and gives a better foundation for long-term viability. See [Key Design Decisions](#key-design-decisions) for full rationale. The Python backend is archived at `/backend-python-archive/` for reference.

### Two Operating Modes

**IMPORTANT**: You may be invoked in two distinct contexts. Understanding the difference is critical:

#### Mode 1: Meta-Development (Current Context)

**What**: Building RezNet AI itself
**When**: Developer says "@orchestrator implement custom agent creation" or similar
**Your role**: Build features for the RezNet AI product
**Documents to read**:
- meta-dev/PRD.md (product requirements for RezNet AI)
- GitHub Issues (#18, #14, etc.)
- CLAUDE.md (this document)
- meta-dev/NFR.md (non-functional requirements)

**Example tasks**:
- Implement Phase 3 of the TypeScript backend rewrite (agent runtime)
- Add workflow visualization (Issue #14)
- Port REST API routes to Fastify

**This is your CURRENT operating mode** - you're building the product.

#### Mode 2: User Mode (Future Context)

**What**: End-users using RezNet AI for their own work
**When**: User says "@orchestrator create marketing campaign" (in their deployed instance)
**Your role**: Coordinate user's custom agents for their domain-specific work
**Documents to read**:
- NOT our meta-dev/PRD.md (that's for building RezNet AI)
- User's own requirements/project docs
- User's custom agent configurations

**This is FUTURE mode** - when RezNet AI is deployed for users.

---

**Key Distinction**: In Meta-Development mode, you build RezNet AI features per our PRD. In User Mode, you help users accomplish THEIR goals using THEIR custom agents and requirements (not our PRD).

### Project Management

- **Issue Tracking**: GitHub Issues (https://github.com/alexg-g/reznet-ai/issues)
- **Current Focus**: TypeScript backend rewrite (8-phase plan)
- **Roadmap**: Check GitHub Issues for planned features and bugs

### Common Tasks

**Adding a new agent**:
1. Define agent persona in `backend-ts/src/agents/specialists.ts`
2. Add to agent registry with model, tools, and system prompt
3. Add to database seed data
4. Update frontend color mapping

**Modifying agent behavior**:
1. Update persona definition in `backend-ts/src/agents/specialists.ts`
2. Adjust tools array for the agent
3. Test with sample conversations

**Adding MCP server**:
1. Create new directory in `/mcp-servers/`
2. Implement MCP protocol interface
3. Update .env configuration
4. Register tool in agent tools configuration

**Working with workflows**:
1. Create workflow via API: `POST /api/workflows/plan` with user request
2. Orchestrator automatically creates task breakdown
3. Start workflow: `POST /api/workflows/{id}/start`
4. Monitor via WebSocket events or `GET /api/workflows/{id}`
5. See `WORKFLOW_TESTING.md` for complete testing guide

**Switching LLM providers**:
1. Update `DEFAULT_LLM_PROVIDER` in `.env`
2. Pi supports 20+ providers out of the box (Anthropic, OpenAI, Google, Ollama, Groq, OpenRouter, Bedrock, etc.)
3. Ensure provider-specific config is set (API key or host URL)
4. Restart backend - agents automatically inherit the new provider
5. Check current config: `GET /api/llm-config`

**Per-agent LLM override** (advanced):
- Each agent instance can use a different model/provider via `getModel(provider, modelId)`
- Update agent config in database to include `"provider": "groq"` or `"model": "llama-3.1-70b"`
- This overrides the global DEFAULT_LLM_PROVIDER for that specific agent
- Useful for cost optimization (e.g., use Groq for QA, Anthropic for orchestration)

---

## Table of Contents

1. [Product Vision & Purpose](#product-vision--purpose)
2. [System Architecture](#system-architecture)
3. [Technology Stack](#technology-stack)
4. [Key Design Decisions](#key-design-decisions)
5. [Agent System Architecture](#agent-system-architecture)
6. [Configuration Guide](#configuration-guide)
7. [Migration Status](#migration-status)
8. [Development Workflow](#development-workflow)
9. [Important Locations](#important-locations)
10. [References](#references)

---

## Product Vision & Purpose

RezNet AI is a **Slack-like chat platform where users orchestrate teams of specialized AI agents to tackle complex work**. Users interact with AI agents through natural language @mentions, coordinating multi-agent workflows across any domain: software development, marketing, legal, research, and more.

**Core Innovation**: Custom multi-agent collaboration system with semantic memory, enabling agents to access real tools (filesystem, GitHub, databases) through Model Context Protocol (MCP). The real-time WebSocket chat interface enables users to coordinate complex workflows by delegating tasks across specialized agents.

**Current MVP**: Single-user local development environment (no authentication) focused on proving the core concept before scaling to multi-user cloud deployment.

---

## System Architecture

### Architecture Diagram

```
┌─────────────────────┐
│   Next.js Client    │  <-- Chat UI (unchanged)
│   localhost:3000    │
└──────────┬──────────┘
           │ WebSocket (Socket.IO) + REST
┌──────────▼──────────┐
│   Fastify Server    │  <-- Message Router, Agent Manager
│   localhost:8000    │      (TypeScript, pi-ai, pi-agent-core)
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│  Pi Agent Instances │  <-- Each agent = independent Agent object
│  • @orchestrator    │      Concurrent via Promise.all()
│  • @backend         │
│  • @frontend        │
│  • @qa              │
│  • @devops          │
└──────────┬──────────┘
           │
┌──────────▼──────────────┐
│  Tools & Services       │
│  • Pi built-in tools    │
│  • MCP Servers (FS/GH)  │
│  • Semantic Memory      │
└──────────┬──────────────┘
           │
┌──────────▼──────────────┐
│  Data Layer             │
│  • PostgreSQL 16 + pgvector │
│  • Redis 7.2            │
└─────────────────────────┘
```

### Component Breakdown

#### Frontend (Next.js) -- Unchanged
- **Location**: `/frontend`
- **Port**: 3000
- **Responsibilities**:
  - Render cyberpunk-themed chat interface
  - Manage WebSocket connections for real-time updates
  - Handle user input and @mention parsing
  - Display agent responses with color-coding
  - Channel navigation and message history
- **State Management**: Zustand (lightweight React state)
- **Key Features**: Typing indicators, markdown rendering, code syntax highlighting

#### Backend (Fastify + TypeScript)
- **Location**: `/backend-ts`
- **Port**: 8000
- **Responsibilities**:
  - REST API for channels, messages, agents, tasks, workflows
  - WebSocket server for real-time communication (Socket.IO)
  - Multi-agent workflow orchestration with DAG dependency resolution
  - Agent coordination and message routing
  - Database operations (PostgreSQL via Drizzle ORM + Redis via ioredis)
  - LLM provider abstraction via pi-ai (20+ providers)
- **Architecture**: Async-first TypeScript with full type safety
- **Key Modules**:
  - `src/agents/` - Pi Agent wrappers, specialist definitions, tools
  - `src/routes/` - Fastify route handlers (channels, agents, tasks, workflows)
  - `src/websocket/` - Socket.IO event handlers
  - `src/db/` - Drizzle ORM schema and database connection
  - `src/llm/` - pi-ai wrapper with retry/fallback layer
  - `src/workflows/` - DAG workflow engine
  - `src/memory/` - Semantic memory manager (pgvector)
  - `src/config.ts` - Zod-validated environment configuration

#### Agent System (Pi Agent Runtime)
- **Location**: `/backend-ts/src/agents`
- **Architecture**: Each specialist is a `pi-agent-core` Agent instance with custom persona, tools, and memory hooks
- **LLM Support**: 20+ providers via pi-ai (`getModel(provider, modelId)`)
- **5 Specialist Agents**:
  1. **@orchestrator** - Team lead, task delegation, workflow planning
  2. **@backend** - Backend engineering expert
  3. **@frontend** - React/Next.js expert
  4. **@qa** - Testing and quality assurance
  5. **@devops** - Infrastructure and deployment

#### MCP Servers
- **Location**: `/mcp-servers`
- **Protocol**: Model Context Protocol 1.0
- **Purpose**: Provide tool access to AI agents
- **Servers**:
  - **Filesystem** (Node.js, port 3001): Read/write/list files
  - **GitHub** (Node.js, port 3002): Repo operations, PRs, issues
  - **Database** (planned): SQL query execution

#### Data Layer
- **PostgreSQL 16**: Primary database with pgvector extension for semantic memory
- **Redis 7.2**: Caching and session storage
- **ORM**: Drizzle ORM (TypeScript-native, reads same PostgreSQL tables)
- **Docker Compose**: Container orchestration for local dev

---

## Technology Stack

| Layer | Technologies | Key Choices |
|-------|-------------|-------------|
| **Frontend** | Next.js 14, TypeScript 5.3, Tailwind CSS, Zustand, Socket.IO | App Router, cyberpunk theme, real-time WebSocket |
| **Backend** | Fastify, TypeScript, Drizzle ORM, Zod | Async-first, Swagger auto-docs, full type safety |
| **Agent Runtime** | pi-agent-core (Agent class), pi-ai (LLM abstraction) | Tool calling loop, context compaction, streaming |
| **Database** | PostgreSQL 16 + pgvector, Redis 7.2 (ioredis) | Unified relational + vector DB, semantic memory |
| **AI/LLM** | pi-ai: Anthropic, OpenAI, Google, Ollama, Groq, OpenRouter, Bedrock, + more | 20+ providers via unified `getModel()` API |
| **MCP** | Filesystem server, GitHub server (Node.js) | Model Context Protocol for tool access |
| **Testing** | Vitest | Fast, TypeScript-native test runner |
| **Infrastructure** | Docker Compose, .env config | Local containerized development |

**Key Design Rationale:**
- **Fastify**: Fastest Node.js HTTP framework, plugin architecture, native TypeScript
- **pi-ai**: Unified LLM API for 20+ providers with built-in token/cost tracking and streaming. Replaces 710 lines of hand-rolled provider code.
- **pi-agent-core**: Agent runtime with tool calling loop, context compaction, and streaming. Each specialist is an independent Agent instance.
- **Drizzle ORM**: TypeScript-native, zero overhead, reads same PostgreSQL tables as SQLAlchemy did
- **PostgreSQL + pgvector**: Single database for relational + vector (semantic memory) data
- **Zod**: Runtime type validation for config, API inputs, and schemas (replaces Pydantic)

---

## Key Design Decisions

### 1. TypeScript Backend Rewrite (2026)

**Decision**: Rewrite backend from Python/FastAPI to TypeScript/Fastify with Pi packages

**Rationale**:
- **No users, no migration cost**: Pre-launch MVP with zero production users. This is the lowest-cost window for a foundational change.
- **Stack unification**: Frontend is already Next.js/TypeScript. Full-stack TypeScript eliminates context switching and enables shared types/validation.
- **20+ LLM providers**: pi-ai provides unified access to Anthropic, OpenAI, Google, Ollama, Groq, OpenRouter, Bedrock, and more. The Python LLMClient only supported 3 providers with 710 lines of hand-rolled code.
- **Better agent runtime**: pi-agent-core provides tool calling loop, context compaction, and streaming out of the box.
- **Type safety end-to-end**: Zod schemas, Drizzle ORM, and TypeScript strict mode provide compile-time guarantees across the entire backend.

**Trade-offs**:
- Pi is a single-maintainer project (bus factor risk). Mitigated by pinning versions and wrapping Pi internals behind our own abstraction layer.
- Significant upfront effort (~12,000 LOC to rewrite). Mitigated by having no users and the Python backend as a reference implementation.

**Risk mitigations**:
- Pin `@mariozechner/pi-ai` and `@mariozechner/pi-agent-core` to exact versions
- Wrapper layer (`src/llm/client.ts`, `src/agents/base-agent.ts`) isolates Pi internals
- If Pi is abandoned, swap to direct SDK calls without changing agent/workflow code

**Reference**: The Python backend (`/backend-python-archive`) is preserved as the reference implementation.

### 2. Local-First MVP Approach

**Decision**: Build for single-user local deployment before cloud

**Rationale**:
- Faster iteration without cloud complexity
- No authentication/authorization overhead
- Lower costs during development
- Easier debugging and testing
- Proves core concept before scaling

**Trade-offs**:
- Not suitable for teams yet
- Manual setup required
- No persistent cloud storage
- Limited to single machine

### 3. Multi-LLM Provider Support (via pi-ai)

**Decision**: Use pi-ai as the unified LLM provider abstraction

**Rationale**:
- 20+ providers through a single `getModel(provider, modelId)` API
- Built-in token counting and cost tracking
- Native streaming support
- Per-agent model selection for cost/quality optimization
- Avoid vendor lock-in

**Implementation**: `backend-ts/src/llm/client.ts` wraps pi-ai with our retry/fallback layer

### 4. Model Context Protocol (MCP)

**Decision**: Use MCP for agent tool access instead of custom solutions

**Rationale**:
- Industry-standard protocol for AI tool use
- Reusable across different AI platforms
- Built-in security and sandboxing
- Community-maintained servers available
- Future-proof architecture

**Current MCP Servers**:
- Filesystem: Safe file operations with workspace constraints
- GitHub: Authenticated API access for repo operations

### 5. Pi Agent Instances for Multi-Agent Concurrency

**Decision**: Each specialist agent is an independent pi-agent-core `Agent` instance, run concurrently via `Promise.all()`

**Rationale**:
- Pi's `Agent` class is single-threaded per instance (one prompt at a time per agent)
- For multi-agent orchestration, we instantiate separate Agent objects per specialist
- This is architecturally identical to the Python approach where each BaseAgent instance ran independently via `asyncio.gather()`
- Sub-agent delegation works by having one agent's output trigger another agent instance

**Implementation**:
```typescript
// Each specialist is its own Agent instance
const agents = {
  backend:      new RezNetAgent({ model: getModel('anthropic', 'claude-sonnet-4-20250514'), ... }),
  frontend:     new RezNetAgent({ model: getModel('anthropic', 'claude-sonnet-4-20250514'), ... }),
  qa:           new RezNetAgent({ model: getModel('groq', 'llama-3.1-70b'), ... }),
  devops:       new RezNetAgent({ model: getModel('openai', 'gpt-4o'), ... }),
  orchestrator: new RezNetAgent({ model: getModel('anthropic', 'claude-sonnet-4-20250514'), ... }),
};

// Parallel execution
const results = await Promise.all(
  readyTasks.map(task => agents[task.agentType].processMessage(task.description, task.context))
);
```

### 6. WebSocket + REST Hybrid

**Decision**: Use WebSockets for real-time chat, REST for data operations

**Rationale**:
- WebSocket: Instant agent responses, typing indicators, live updates
- REST: CRUD operations, easier to test, better caching
- Hybrid approach gives best of both worlds

**Implementation**:
- Socket.IO for WebSocket (same event contract as Python backend)
- Fastify REST endpoints with `@fastify/swagger` for API docs

### 7. Cyberpunk UI Theme

**Decision**: Distinctive visual identity instead of generic chat UI

**Color System**:
- **@orchestrator**: Electric Purple (#9D00FF)
- **@backend**: Neon Cyan (#00F6FF)
- **@frontend**: Hot Magenta (#FF00F7)
- **@qa**: Lime Green (#39FF14)
- **@devops**: Orange Neon (#FF6B00)

### 8. No Authentication in MVP

**Decision**: Skip auth for local single-user MVP

**Security Model**:
- Local network only (not exposed to internet)
- File access limited to workspace directory
- MCP servers have their own auth tokens
- Secret management via .env file

---

## Agent System Architecture

### Agent Roles & Specializations

**Implementation**: See `backend-ts/src/agents/specialists.ts` for agent definitions and persona configurations.

| Agent | Role | Key Responsibilities | Color |
|-------|------|---------------------|-------|
| **@orchestrator** | Team Lead | Task decomposition, delegation, workflow coordination | Electric Purple (#9D00FF) |
| **@backend** | Backend Engineer | APIs, database design, server-side logic | Neon Cyan (#00F6FF) |
| **@frontend** | Frontend Developer | React/Next.js UI, accessibility, TypeScript components | Hot Magenta (#FF00F7) |
| **@qa** | QA Specialist | Testing (unit/integration/e2e), edge cases, quality metrics | Lime Green (#39FF14) |
| **@devops** | DevOps Engineer | Docker, CI/CD, deployment, monitoring, infrastructure | Orange Neon (#FF6B00) |

**Agent Capabilities**:
- Each agent is a `pi-agent-core` Agent instance with custom persona and tools
- Access to MCP tools (filesystem, GitHub) + Pi built-in tools
- 20+ LLM providers via pi-ai with per-agent model selection
- Context-aware through conversation history + semantic memory retrieval
- Semantic long-term memory with pgvector

### Agent Communication Patterns

#### 1. Direct Invocation
User directly mentions an agent:
```
User: "@backend How do I implement JWT authentication?"
--> Backend agent responds directly
```

#### 2. Orchestrated Workflow
User asks orchestrator to coordinate:
```
User: "@orchestrator Build a user registration feature"
--> Orchestrator plans tasks (DAG)
--> Delegates to @backend (API), @frontend (UI), @qa (tests)
--> Runs ready tasks concurrently via Promise.all()
--> Coordinates execution and reports progress
```

#### 3. Agent-to-Agent Collaboration
Agents can mention each other:
```
@backend: "I've completed the API. @frontend can you build the UI?"
--> Frontend agent receives task context
--> Builds on backend's work
```

### Agent Memory & Context

**Implementation**:
- Short-term: Recent messages in conversation (context window)
- Long-term: Semantic memory with pgvector (`backend-ts/src/memory/manager.ts`)
  - Vector similarity search for relevant past context (cosine distance)
  - Context summarization
  - Entity extraction
  - Importance scoring
- Pi context transform hooks inject relevant memories into agent context

**Memory Integration with Pi Agent**:
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

**Embedding Model**: nomic-embed-text via Ollama (768 dimensions). Same model and vector format as the Python implementation -- no re-embedding needed.

---

## Configuration Guide

**See `.env.example` for complete configuration template.**

### Key Configuration Areas

1. **Database**: PostgreSQL and Redis connection strings
2. **LLM Providers**: Default provider + API keys. Pi supports 20+ providers; configure the ones you need.
3. **MCP Servers**: Filesystem and GitHub server settings, ports, and tokens
4. **Feature Flags**: Agent memory, voice input, code execution, web search (future features)
5. **Backend API**: Host, port, CORS origins
6. **Development**: Debug mode, logging level

### Configuration Files

- **`.env`**: Environment variables (create from `.env.example`)
- **`backend-ts/src/config.ts`**: Zod-validated configuration with type safety
- Frontend env vars use `NEXT_PUBLIC_` prefix for client-side access

---

## Migration Status

**Completed Migration**: Python/FastAPI --> TypeScript/Fastify (all 8 phases complete)

### Phase Overview

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | TypeScript Backend Scaffold (Fastify + Drizzle + DB connection) | Complete |
| 2 | LLM Layer -- pi-ai integration (replaces 710-LOC LLMClient) | Complete |
| 3 | Agent Runtime -- pi-agent-core (5 specialist Agent instances) | Complete |
| 4 | WebSocket + Message Routing (Socket.IO, same frontend contract) | Complete |
| 5 | Workflow Orchestration Engine (DAG, Promise.all) | Complete |
| 6 | Semantic Memory (pgvector, same vectors, no re-embedding) | Complete |
| 7 | REST API Routes (all endpoints, Swagger UI) | Complete |
| 8 | Cutover + Cleanup (switch docker-compose, archive Python) | Complete |

### Python Reference Code (Archived)

The Python backend (`/backend-python-archive`) is preserved as the reference implementation. Consult these files for behavior context:

| Python Source | Purpose | LOC | TypeScript Replacement |
|---|---|---|---|
| `backend-python-archive/agents/llm_client.py` | LLM abstraction | 710 | `src/llm/client.ts` |
| `backend-python-archive/agents/base.py` | BaseAgent class | 560 | `src/agents/base-agent.ts` |
| `backend-python-archive/agents/base_with_memory.py` | Memory layer | 260 | `src/agents/base-agent.ts` |
| `backend-python-archive/agents/specialists.py` | 5 specialist agents | 257 | `src/agents/specialists.ts` |
| `backend-python-archive/agents/processor.py` | Message processing | 686 | `src/agents/processor.ts` |
| `backend-python-archive/agents/workflow_orchestrator.py` | DAG workflow engine | 743 | `src/workflows/engine.ts` |
| `backend-python-archive/agents/memory_manager.py` | Semantic memory | 553 | `src/memory/manager.ts` |
| `backend-python-archive/agents/mcp_client.py` | MCP filesystem client | 334 | `src/agents/tools/filesystem.ts` |
| `backend-python-archive/agents/tool_schemas.py` | Tool definitions | 377 | `src/agents/tools/*.ts` |
| `backend-python-archive/websocket/manager.py` | Socket.IO manager | 606 | `src/websocket/manager.ts` |
| `backend-python-archive/core/config.py` | Configuration | 98 | `src/config.ts` |
| `backend-python-archive/core/error_handling.py` | Error handling | 327 | `src/llm/error-handling.ts` |
| `backend-python-archive/models/database.py` | Database models | 252 | `src/db/schema.ts` |
| `backend-python-archive/routers/*.py` | REST endpoints | ~1,500 | `src/routes/*.ts` |

---

## Development Workflow

### Quick Start

**Setup** (first time only):
```bash
./scripts/setup.sh
```

**Start all services**:
```bash
./scripts/start.sh
```

**Access Points**:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

**Stop all services**:
```bash
./scripts/stop.sh
```

For detailed installation and prerequisites, see README.md.

### Project Conventions

**TypeScript (Backend + Frontend)**:
- TypeScript strict mode
- Zod for runtime validation (backend config, API inputs)
- Async/await for all I/O operations
- Drizzle ORM for database queries
- Vitest for testing

**TypeScript/React (Frontend)**:
- Functional components with hooks
- Tailwind for styling (no CSS modules)
- Zustand for state management
- Server components where possible (Next.js)

**Git Workflow**:
- Main branch: `main`
- Feature branches: `feature/description`
- Clean commit messages
- No secrets in commits

---

## Important Locations

### Key Files

**Configuration**:
- `/.env` - Environment variables (create from .env.example)
- `/backend-ts/src/config.ts` - Zod-validated backend configuration
- `/docker-compose.yml` - Docker services (PostgreSQL, Redis)

**Backend Core** (`/backend-ts/src/`):
- `index.ts` - Fastify + Socket.IO entry point
- `config.ts` - Zod-validated environment config
- `db/schema.ts` - Drizzle ORM schema (10 models)
- `db/connection.ts` - PostgreSQL pool + Redis client
- `llm/client.ts` - pi-ai wrapper with retry/fallback
- `llm/error-handling.ts` - Error classification, retry, fallback chain
- `agents/base-agent.ts` - RezNet agent wrapper around Pi's Agent class
- `agents/specialists.ts` - 5 specialist definitions (persona, tools, model)
- `agents/processor.ts` - @mention parsing, agent routing, streaming relay
- `agents/tools/filesystem.ts` - File tools via Pi built-in + MCP
- `agents/tools/delegation.ts` - @mention parsing + agent delegation tool
- `workflows/engine.ts` - DAG workflow lifecycle, parallel execution
- `memory/manager.ts` - Semantic memory (pgvector, embeddings)
- `websocket/manager.ts` - Socket.IO connection manager
- `routes/` - Fastify REST route handlers

**Frontend Core**:
- `/frontend/app/page.tsx` - Main chat interface
- `/frontend/app/layout.tsx` - Root layout with providers
- `/frontend/components/` - React components
- `/frontend/lib/store.ts` - Zustand state management

**MCP Servers**:
- `/mcp-servers/filesystem/` - Filesystem operations
- `/mcp-servers/github/` - GitHub integration

**Python Reference** (archived):
- `/backend-python-archive/` - Original Python/FastAPI implementation (reference only)

### Data Directories

```
/data/
├── workspaces/      # User project files
├── agent-memory/    # Agent long-term memory (RAG)
├── uploads/         # File uploads from users
└── redis/           # Redis persistence
```

### Documentation

**Root Level**:
- `/README.md` - Quick start guide
- `/CLAUDE.md` - This file (architecture and context)
- `/CONTRIBUTING.md` - Developer contribution guidelines
- `/WORKFLOW_TESTING.md` - Multi-agent workflow testing guide

**Planning Docs**:
- `/meta-dev/PRD.md` - Product requirements document
- `/meta-dev/NFR.md` - Non-functional requirements
- `/planning-docs/reznet-ai-technical-guide.md` - Detailed technical spec

---

## References

### Primary Documentation

1. **README.md** - Quick start, installation, usage examples
2. **CLAUDE.md** - This file - architecture, design decisions, and project context
3. **meta-dev/PRD.md** - Product requirements document
4. **meta-dev/NFR.md** - Non-functional requirements
5. **WORKFLOW_TESTING.md** - Multi-agent workflow testing guide
6. **planning-docs/reznet-ai-technical-guide.md** - Detailed technical specification
7. **API Documentation** - http://localhost:8000/docs (when backend running)
8. **GitHub Issues** - Project management, bugs, feature requests

### External Resources

**Backend Frameworks & Libraries**:
- [Fastify Documentation](https://fastify.dev/docs/latest/)
- [Drizzle ORM Documentation](https://orm.drizzle.team/docs/overview)
- [Zod Documentation](https://zod.dev/)
- [Vitest Documentation](https://vitest.dev/)

**AI/Agent Packages**:
- [Pi Mono Repository](https://github.com/badlogic/pi-mono) (pi-ai, pi-agent-core)
- [Model Context Protocol](https://modelcontextprotocol.io)

**Frontend**:
- [Next.js Documentation](https://nextjs.org/docs)

**LLM Providers**:
- [Anthropic Claude API](https://docs.anthropic.com/)
- [OpenAI API](https://platform.openai.com/docs)
- [Google AI (Gemini)](https://ai.google.dev/docs)
- [Ollama](https://ollama.ai/)
- [Groq](https://console.groq.com/docs)

**Database & Storage**:
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [pgvector Extension](https://github.com/pgvector/pgvector)
- [Redis Documentation](https://redis.io/docs/)

---

**Last Updated**: 2026-02-24 (TypeScript backend migration complete — all 8 phases done)
**Maintained By**: RezNet AI Team

---

*This document is a living reference. Update it as the architecture evolves.*
