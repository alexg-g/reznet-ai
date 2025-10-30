# CLAUDE.md - RezNet AI Project Context

> **Purpose**: This document provides foundational context for AI assistants and developers working on RezNet AI. It consolidates architectural decisions, design patterns, and essential project knowledge.

**Last Updated**: 2025-10-25
**Project Status**: Production-ready Local MVP
**Version**: 1.0.1

---

## For AI Assistants Working on This Project

### Context Summary

You are working on **RezNet AI**, a platform where developers orchestrate AI agents to build software. The system is currently a fully functional local MVP with:

- 5 specialized AI agents (@orchestrator, @backend, @frontend, @qa, @devops)
- **Multi-agent workflow orchestration** (task dependencies, parallel execution, real-time progress)
- Real-time chat interface (Next.js + Socket.IO)
- Multi-LLM support (Anthropic, OpenAI, Ollama)
- MCP integration for tool access
- PostgreSQL + Redis data layer

### Two Operating Modes

**IMPORTANT**: You may be invoked in two distinct contexts. Understanding the difference is critical:

#### Mode 1: Meta-Development (Current Context)

**What**: Building RezNet AI itself
**When**: Developer says "@orchestrator implement custom agent creation" or similar
**Your role**: Build features for the RezNet AI product
**Documents to read**:
- ✅ meta-dev/PRD.md (product requirements for RezNet AI)
- ✅ GitHub Issues (#18, #14, etc.)
- ✅ CLAUDE.md (this document)
- ✅ meta-dev/NFR.md (non-functional requirements)

**Example tasks**:
- Implement custom agent creation UI (Issue #18)
- Add workflow visualization (Issue #14)
- Optimize performance (< 3s response time)

**This is your CURRENT operating mode** - you're building the product.

#### Mode 2: User Mode (Future Context)

**What**: End-users using RezNet AI for their own work
**When**: User says "@orchestrator create marketing campaign" (in their deployed instance)
**Your role**: Coordinate user's custom agents for their domain-specific work
**Documents to read**:
- ❌ NOT our meta-dev/PRD.md (that's for building RezNet AI)
- ✅ User's own requirements/project docs
- ✅ User's custom agent configurations

**Example tasks** (when users are using RezNet AI):
- Orchestrate marketing agents to create content calendar
- Coordinate research agents to conduct literature review
- Manage legal agents to review contracts

**This is FUTURE mode** - when RezNet AI is deployed for users.

---

**Key Distinction**: In Meta-Development mode, you build RezNet AI features per our PRD. In User Mode, you help users accomplish THEIR goals using THEIR custom agents and requirements (not our PRD).

### Project Management

- **Issue Tracking**: GitHub Issues (https://github.com/yourusername/reznet-ai/issues)
- **Current Status**: See NEXT_STEPS.md for what's working and known issues
- **Roadmap**: Check GitHub Issues for planned features and bugs

### Common Tasks

**Adding a new agent**:
1. Create agent class in `backend/agents/specialists.py`
2. Register in `backend/agents/__init__.py`
3. Add to database seed data
4. Update frontend color mapping

**Modifying agent behavior**:
1. Update `get_system_prompt()` in specialist class
2. Adjust tools available to agent
3. Test with sample conversations

**Adding MCP server**:
1. Create new directory in `/mcp-servers/`
2. Implement MCP protocol interface
3. Update .env configuration
4. Register in backend MCP client

**Working with workflows**:
1. Create workflow via API: `POST /api/workflows/plan` with user request
2. Orchestrator automatically creates task breakdown
3. Start workflow: `POST /api/workflows/{id}/start`
4. Monitor via WebSocket events or `GET /api/workflows/{id}`
5. See `WORKFLOW_TESTING.md` for complete testing guide

**Switching LLM providers**:
1. Update `DEFAULT_LLM_PROVIDER` in `.env` (anthropic, openai, or ollama)
2. Ensure provider-specific config is set (API key or Ollama host)
3. Restart backend - agents automatically inherit the new provider
4. Check current config: `GET /api/llm-config`
5. All agents dynamically use the configured provider unless they have a per-agent override

**Per-agent LLM override** (advanced):
- Update agent config in database to include `"provider": "ollama"` or `"model": "gpt-4"`
- This overrides the global DEFAULT_LLM_PROVIDER for that specific agent
- Useful for testing or using different models for different agent roles

---

## Table of Contents

1. [Product Vision & Purpose](#product-vision--purpose)
2. [System Architecture](#system-architecture)
3. [Technology Stack](#technology-stack)
4. [Key Design Decisions](#key-design-decisions)
5. [Agent System Architecture](#agent-system-architecture)
6. [Configuration Guide](#configuration-guide)
7. [Current Status](#current-status)
8. [Development Workflow](#development-workflow)
9. [Important Locations](#important-locations)
10. [References](#references)

---

## Product Vision & Purpose

RezNet AI is a **Slack-like chat platform where developers orchestrate teams of AI agents to build software**. Instead of managing a human team, developers interact with 5 specialized AI agents (@orchestrator, @backend, @frontend, @qa, @devops) that collaborate on software development tasks using natural language @mentions.

**Core Innovation**: Custom multi-agent collaboration system with semantic memory, enabling agents to access real tools (filesystem, GitHub, databases) through Model Context Protocol (MCP). The real-time WebSocket chat interface enables developers to coordinate complex development workflows by delegating tasks across specialized agents.

**Current MVP**: Single-user local development environment (no authentication) focused on proving the core concept before scaling to multi-user cloud deployment.

---

## System Architecture

**See README.md for complete architecture diagram.**

### Component Breakdown

#### Frontend (Next.js)
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

#### Backend (FastAPI)
- **Location**: `/backend`
- **Port**: 8000
- **Responsibilities**:
  - REST API for channels, messages, agents, tasks, workflows
  - WebSocket server for real-time communication
  - Multi-agent workflow orchestration with dependency resolution
  - Agent coordination and message routing
  - Database operations (PostgreSQL + Redis)
  - LLM provider abstraction (multi-provider support)
- **Architecture**: Async-first design for high concurrency
- **Key Modules**:
  - `agents/` - Agent implementations, LLM client, workflow orchestrator
  - `routers/` - FastAPI route handlers (channels, agents, tasks, workflows)
  - `websocket/` - Socket.IO event handlers
  - `models/` - SQLAlchemy database models (including workflows)
  - `core/` - Configuration and utilities

#### Agent System (Custom Architecture)
- **Location**: `/backend/agents`
- **Architecture**: Custom BaseAgent with semantic memory (pgvector)
- **LLM Support**: Multi-provider (Anthropic, OpenAI, Ollama)
- **5 Specialist Agents**:
  1. **@orchestrator** - Team lead, task delegation
  2. **@backend** - Python/FastAPI expert
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
- **PostgreSQL 16**: Primary database with pgvector extension for RAG
- **Redis 7.2**: Caching and session storage
- **Docker Compose**: Container orchestration for local dev

---

## Technology Stack

| Layer | Technologies | Key Choices |
|-------|-------------|-------------|
| **Frontend** | Next.js 14, TypeScript 5.3, Tailwind CSS, Zustand, Socket.IO | App Router, cyberpunk theme, real-time WebSocket |
| **Backend** | FastAPI, Python 3.12, SQLAlchemy (async), Custom Agent System | Async-first, OpenAPI auto-docs, agent orchestration |
| **Database** | PostgreSQL 16 + pgvector, Redis 7.2 | Unified relational + vector DB, semantic memory |
| **AI/ML** | Anthropic Claude (primary), OpenAI, Ollama (local) | Multi-LLM provider abstraction for flexibility |
| **MCP** | Filesystem server, GitHub server (Node.js) | Model Context Protocol for tool access |
| **Infrastructure** | Docker Compose, Uvicorn, .env config | Local containerized development |

**Key Design Rationale:**
- **FastAPI**: Async performance, automatic API docs, Python type hints
- **PostgreSQL + pgvector**: Single database for relational + vector (semantic memory) data
- **Multi-LLM**: Flexibility (Anthropic for reasoning, Ollama for local/offline, OpenAI fallback)
- **Custom Agent System**: Full control over system prompts, no framework lock-in, semantic memory with pgvector

---

## Key Design Decisions

### 1. Local-First MVP Approach

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

### 2. Multi-LLM Provider Support

**Decision**: Abstract LLM providers behind unified interface

**Rationale**:
- Flexibility to choose best model for each task
- Cost optimization (use cheaper models for simple tasks)
- Offline capability with Ollama
- Avoid vendor lock-in
- Graceful degradation if one provider fails

**Implementation**: See `backend/agents/llm_client.py:1`

### 3. Model Context Protocol (MCP)

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

### 4. Custom Agent System with Semantic Memory

**Decision**: Build custom agent architecture instead of using CrewAI framework

**Rationale**:
- Full control over system prompts (critical for user customization)
- No framework injections or hidden behavior
- Lighter weight and easier to debug
- Direct LLM integration (Anthropic, OpenAI, Ollama)
- Custom semantic memory with pgvector (no framework lock-in)
- Simpler onboarding for contributors

**Trade-offs**:
- Must implement coordination patterns ourselves
- More code to maintain
- Need to build memory management (implemented with SemanticMemoryManager)

### 5. WebSocket + REST Hybrid

**Decision**: Use WebSockets for real-time chat, REST for data operations

**Rationale**:
- WebSocket: Instant agent responses, typing indicators, live updates
- REST: CRUD operations, easier to test, better caching
- Hybrid approach gives best of both worlds

**Implementation**:
- Socket.IO for WebSocket (better browser compat than raw WS)
- FastAPI REST endpoints for channels, tasks, agents

### 6. Cyberpunk UI Theme

**Decision**: Distinctive visual identity instead of generic chat UI

**Rationale**:
- Memorable brand identity
- Appeals to developer audience
- Differentiates from Slack clones
- Fun and engaging to use
- Showcases modern CSS capabilities

**Color System**:
- **@orchestrator**: Electric Purple (#9D00FF)
- **@backend**: Neon Cyan (#00F6FF)
- **@frontend**: Hot Magenta (#FF00F7)
- **@qa**: Lime Green (#39FF14)
- **@devops**: Orange Neon (#FF6B00)

### 7. No Authentication in MVP

**Decision**: Skip auth for local single-user MVP

**Rationale**:
- Significantly reduces complexity
- Faster development velocity
- Not needed for local-only deployment
- Easy to add later for cloud version

**Security Model**:
- Local network only (not exposed to internet)
- File access limited to workspace directory
- MCP servers have their own auth tokens
- Secret management via .env file

---

## Agent System Architecture

### Agent Roles & Specializations

**Implementation**: See `backend/agents/specialists.py` for complete agent definitions and system prompts.

| Agent | Role | Key Responsibilities | Color |
|-------|------|---------------------|-------|
| **@orchestrator** | Team Lead | Task decomposition, delegation, workflow coordination | Electric Purple (#9D00FF) |
| **@backend** | Backend Engineer | Python/FastAPI APIs, database design, server-side logic | Neon Cyan (#00F6FF) |
| **@frontend** | Frontend Developer | React/Next.js UI, accessibility, TypeScript components | Hot Magenta (#FF00F7) |
| **@qa** | QA Specialist | Testing (unit/integration/e2e), edge cases, quality metrics | Lime Green (#39FF14) |
| **@devops** | DevOps Engineer | Docker, CI/CD, deployment, monitoring, infrastructure | Orange Neon (#FF6B00) |

**Agent Capabilities**:
- Custom BaseAgent with semantic memory (SemanticMemoryManager)
- Access to MCP tools (filesystem, GitHub, databases)
- Multi-LLM support (Anthropic, OpenAI, Ollama)
- Context-aware through conversation history + semantic retrieval
- Semantic long-term memory with pgvector (50+ message context window)

### Agent Communication Patterns

#### 1. Direct Invocation
User directly mentions an agent:
```
User: "@backend How do I implement JWT authentication?"
→ Backend agent responds directly
```

#### 2. Orchestrated Workflow
User asks orchestrator to coordinate:
```
User: "@orchestrator Build a user registration feature"
→ Orchestrator breaks down task
→ Delegates to @backend (API), @frontend (UI), @qa (tests)
→ Coordinates execution and reports progress
```

#### 3. Agent-to-Agent Collaboration
Agents can mention each other:
```
@backend: "I've completed the API. @frontend can you build the UI?"
→ Frontend agent receives task context
→ Builds on backend's work
```

### Agent Memory & Context

**Current Implementation**:
- Short-term: Last 10 messages in conversation (recent context)
- Long-term: Semantic memory with pgvector (SemanticMemoryManager)
  - Vector similarity search for relevant past context
  - Context summarization
  - Entity extraction
  - Importance scoring

**Future Enhancements**:
- Multi-modal memories (images, code snippets)
- Memory sharing across agents
- Importance learning via ML
- Knowledge graph of codebase
- Ollama embeddings for local operation

---

## Configuration Guide

**See `.env.example` for complete configuration template.**

### Key Configuration Areas

1. **Database**: PostgreSQL and Redis connection strings
2. **LLM Providers**: Anthropic (primary), OpenAI, Ollama - configure API keys and default models
3. **MCP Servers**: Filesystem and GitHub server settings, ports, and tokens
4. **Feature Flags**: Agent memory, voice input, code execution, web search (future features)
5. **Backend API**: Host, port, CORS origins, worker configuration
6. **Development**: Debug mode, logging level, hot reload settings

### Configuration Files

- **`.env`**: Environment variables (create from `.env.example`)
- **`backend/core/config.py`**: Pydantic Settings with validation and type safety
- Frontend env vars use `NEXT_PUBLIC_` prefix for client-side access

---

## Current Status

**Project Status**: Fully functional local MVP ✅

**What's Working**:
- Backend REST API + WebSocket server (http://localhost:8000)
- Frontend cyberpunk chat UI (http://localhost:3000)
- 5 AI agents operational with Anthropic Claude
- **Multi-agent workflow orchestration system (Issue #6 complete)**
- PostgreSQL + Redis infrastructure with workflow tables
- Real-time messaging with @mention support
- Real-time workflow progress tracking via WebSocket

**Recent Additions**:
- **2025-10-25**: Dynamic LLM provider inheritance (Issue #1 resolved)
  - Agents now automatically use DEFAULT_LLM_PROVIDER from .env
  - Removed hardcoded model names from database
  - Added `/api/llm-config` endpoint for provider visibility
  - Enhanced startup logging to show active LLM provider
- **2025-10-24**: Multi-agent workflow system with DAG dependency resolution
  - Parallel/sequential task execution
  - Workflow REST API endpoints
  - Enhanced orchestrator agent for structured planning

**Project Management**: See GitHub Issues for bugs, feature requests, and roadmap

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

**Python**:
- Use type hints everywhere
- Async/await for I/O operations
- Pydantic for data validation
- FastAPI dependency injection
- Comprehensive docstrings

**TypeScript/React**:
- Functional components with hooks
- TypeScript strict mode
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
- `/backend/core/config.py` - Backend configuration
- `/docker-compose.yml` - Docker services

**Backend Core**:
- `/backend/main.py` - FastAPI app entry point
- `/backend/agents/specialists.py` - Agent implementations
- `/backend/agents/llm_client.py` - LLM provider abstraction
- `/backend/agents/workflow_orchestrator.py` - Multi-agent workflow orchestration engine
- `/backend/agents/processor.py` - Agent message processing
- `/backend/models/database.py` - Database models (including Workflow, WorkflowTask)
- `/backend/routers/workflows.py` - Workflow API endpoints
- `/backend/websocket/manager.py` - WebSocket connection manager

**Frontend Core**:
- `/frontend/app/page.tsx` - Main chat interface
- `/frontend/app/layout.tsx` - Root layout with providers
- `/frontend/components/` - React components
- `/frontend/lib/store.ts` - Zustand state management

**MCP Servers**:
- `/mcp-servers/filesystem/` - Filesystem operations
- `/mcp-servers/github/` - GitHub integration

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
- `/NEXT_STEPS.md` - Current status and known issues
- `/CLAUDE.md` - This file (architecture and context)
- `/WORKFLOW_TESTING.md` - Multi-agent workflow testing guide
- `/WORKFLOW_IMPLEMENTATION_SUMMARY.md` - Workflow system implementation details

**Planning Docs**:
- `/planning-docs/reznet-ai-technical-guide.md` - Detailed technical spec
- `/planning-docs/workflow-system-design.md` - Workflow architecture and design

---

## References

### Primary Documentation

1. **README.md** - Quick start, installation, usage examples
2. **NEXT_STEPS.md** - Current MVP status, known issues, testing notes
3. **CLAUDE.md** - This file - architecture, design decisions, and project context
4. **WORKFLOW_TESTING.md** - Multi-agent workflow testing guide with test scenarios
5. **WORKFLOW_IMPLEMENTATION_SUMMARY.md** - Workflow system implementation details
6. **planning-docs/reznet-ai-technical-guide.md** - Detailed technical specification
7. **planning-docs/workflow-system-design.md** - Workflow system architecture
8. **API Documentation** - http://localhost:8000/docs (when backend running)
9. **GitHub Issues** - Project management, bugs, feature requests

### External Resources

**Frameworks & Libraries**:
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Next.js Documentation](https://nextjs.org/docs)
- [pgvector Documentation](https://github.com/pgvector/pgvector)
- [Model Context Protocol](https://modelcontextprotocol.io)

**LLM Providers**:
- [Anthropic Claude API](https://docs.anthropic.com/)
- [OpenAI API](https://platform.openai.com/docs)
- [Ollama](https://ollama.ai/)

**Database & Storage**:
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [pgvector Extension](https://github.com/pgvector/pgvector)
- [Redis Documentation](https://redis.io/docs/)

---

**Last Updated**: 2025-10-24 (Added multi-agent workflow system)
**Maintained By**: RezNet AI Team
**Questions?**: Check GitHub Issues, NEXT_STEPS.md, or WORKFLOW_TESTING.md for current status

---

*This document is a living reference. Update it as the architecture evolves.*
