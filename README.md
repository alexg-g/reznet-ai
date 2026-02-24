# RezNet AI - Local MVP

![CI](https://github.com/alexg-g/reznet-ai/workflows/CI/badge.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)
![Node.js](https://img.shields.io/badge/node-18+-green.svg)
![Status](https://img.shields.io/badge/status-MVP-yellow.svg)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)

> Multi-Agent AI Collaboration Platform

RezNet AI is a Slack-like chat platform where you orchestrate teams of specialized AI agents to tackle complex work. Start with our developer-focused agents (Backend, Frontend, QA, DevOps, Orchestrator), or build your own team for any domain - marketing, legal, research, and more.

**Status**: Local MVP - Single User Development Environment

---

## Features

- **Multi-Agent System**: Coordinate specialized AI agents for different tasks
- **20+ LLM Providers**: Anthropic, OpenAI, Google, Ollama, Groq, OpenRouter, Bedrock, and more via [pi-ai](https://github.com/badlogic/pi-mono)
- **Real-time Chat Interface**: Slack-like UI with WebSocket communication
- **Multi-Agent Workflows**: DAG-based task orchestration with parallel execution
- **MCP Integration**: Model Context Protocol for filesystem and GitHub operations
- **Agent Memory**: Semantic memory with pgvector for context awareness across conversations
- **Task Tracking**: Built-in task management and delegation
- **Full-Stack TypeScript**: Unified TypeScript stack (Next.js frontend + Fastify backend)

## Architecture

```
┌─────────────────────┐
│   Next.js Client    │  <-- Chat UI
│   localhost:3000    │
└──────────┬──────────┘
           │ WebSocket + REST
┌──────────▼──────────┐
│   Fastify Server    │  <-- Message Router
│   localhost:8000    │      Agent Manager (pi-ai + pi-agent-core)
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│  Pi Agent Instances │
│  • @orchestrator    │  <-- Coordinates tasks
│  • @backend         │  <-- Backend expert
│  • @frontend        │  <-- React/UI expert
│  • @qa              │  <-- Testing specialist
│  • @devops          │  <-- Infrastructure expert
└──────────┬──────────┘
           │
┌──────────▼──────────────┐
│  MCP Servers (Local)    │
│  • Filesystem (3001)    │
│  • GitHub (3002)        │
└─────────────────────────┘
```

## Quick Start

### Prerequisites

- **Docker Desktop** (for PostgreSQL + Redis)
- **Node.js 18+**
- **Anthropic API Key** (or OpenAI/Google/Ollama/Groq)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/alexg-g/reznet-ai.git
cd reznet-ai
```

2. **Run the setup script**
```bash
./scripts/setup.sh
```

This will:
- Check prerequisites
- Configure environment variables
- Start Docker services (PostgreSQL + Redis)
- Install backend dependencies (npm)
- Install MCP server dependencies
- Optionally set up the frontend

3. **Add your API keys**

Edit `.env` and add your Anthropic API key:
```bash
ANTHROPIC_API_KEY=your-key-here
```

Optional: Add GitHub token for GitHub MCP server:
```bash
MCP_GITHUB_TOKEN=your-github-token
```

4. **Start all services**
```bash
./scripts/start.sh
```

5. **Access the application**
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- Frontend: http://localhost:3000

## Available Agents

### @orchestrator
**Role**: Team Lead & Project Orchestrator

Coordinates development tasks, breaks down complex requirements, and delegates to specialist agents. Plans multi-agent workflows with DAG dependency resolution.

### @backend
**Role**: Senior Backend Engineer
Specializes in APIs, databases, and server-side logic.

### @frontend
**Role**: Senior Frontend Developer
Expert in React, Next.js, TypeScript, Tailwind CSS, and modern UI/UX.

### @qa
**Role**: QA Engineer & Testing Specialist
Writes comprehensive tests, finds edge cases, ensures code quality.

### @devops
**Role**: DevOps Engineer
Manages infrastructure, Docker, CI/CD, deployment, and monitoring.

## Usage Examples

### Via Chat Interface
Open http://localhost:3000 and interact with agents:

```
# Direct agent mention
@backend How do I implement JWT authentication?

# Orchestrated workflow
@orchestrator Build a user registration feature with email verification

# Context reset
/clear
```

**Slash Commands:**
- `/clear` - Reset channel context (agents won't see previous messages)

### Via API
```bash
# Invoke an agent directly
curl -X POST http://localhost:8000/api/agents/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "agent_name": "@backend",
    "message": "Explain how to implement JWT authentication",
    "context": {}
  }'

# Clear channel context
curl -X POST http://localhost:8000/api/channels/{channel_id}/clear \
  -H "Content-Type: application/json"
```

### Via WebSocket
Connect to `ws://localhost:8000/ws` and send messages that mention agents like `@backend`, `@frontend`, etc.

## Project Structure

```
reznet-ai/
├── backend-ts/            # TypeScript backend (Fastify)
│   ├── src/
│   │   ├── agents/       # Pi Agent instances + specialists
│   │   ├── db/           # Drizzle ORM schema + connection
│   │   ├── llm/          # pi-ai wrapper + error handling
│   │   ├── memory/       # Semantic memory (pgvector)
│   │   ├── routes/       # Fastify REST routes
│   │   ├── websocket/    # Socket.IO handlers
│   │   ├── workflows/    # DAG workflow engine
│   │   ├── config.ts     # Zod-validated config
│   │   └── index.ts      # Fastify entry point
│   ├── package.json
│   └── vitest.config.ts
│
├── frontend/              # Next.js frontend
│   ├── app/              # App Router pages
│   ├── components/       # React components
│   └── lib/              # Zustand store, utilities
│
├── mcp-servers/           # MCP servers
│   ├── filesystem/       # File system operations
│   └── github/           # GitHub integration
│
├── data/                  # Local data storage
├── scripts/              # Automation scripts
└── docker-compose.yml    # Docker services (PostgreSQL + Redis)
```

## Development

### Running Services Individually

**Backend**:
```bash
cd backend-ts
npm run dev
```

**Frontend**:
```bash
cd frontend
npm run dev
```

**MCP Servers**:
```bash
cd mcp-servers/filesystem && npm start
cd mcp-servers/github && npm start
```

### Database Access

```bash
# PostgreSQL
docker exec -it reznet-postgres psql -U postgres -d reznetai_local

# Redis
docker exec -it reznet-redis redis-cli
```

### Running Tests

```bash
cd backend-ts
npm test
```

### Stop All Services

```bash
./scripts/stop.sh
```

### Reset Database

```bash
./scripts/reset.sh
```

## Troubleshooting

### Port Already in Use
```bash
lsof -i :8000  # Find process
kill -9 <PID>  # Kill it
```

### Database Connection Failed
```bash
docker-compose restart postgres
docker-compose logs postgres
```

### Agent Not Responding
1. Check API key is set in `.env`
2. Check backend logs: `tail -f logs/backend.log`
3. Verify LLM provider is accessible

## API Documentation

Interactive API docs available at:
- **Swagger UI**: http://localhost:8000/docs

## Roadmap

### Current (v1.0 - Local MVP)
- Multi-agent system with 5 specialist agents
- Real-time WebSocket communication
- Multi-LLM support (20+ providers via pi-ai)
- MCP integration (Filesystem, GitHub)
- Multi-agent workflow orchestration (DAG)
- Semantic memory with pgvector
- Task management

### Next Steps
- Custom agent creation UI
- Workflow visualization
- Code execution sandbox
- Agent template library

### Future
- Multi-user support
- Cloud deployment
- Agent marketplace
- Usage analytics

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

### How to Contribute

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Commit your changes** (`git commit -m 'Add amazing feature'`)
4. **Push to the branch** (`git push origin feature/amazing-feature`)
5. **Open a Pull Request**

## Community

- **Issues**: [GitHub Issues](https://github.com/alexg-g/reznet-ai/issues) - Bug reports & feature requests
- **Discussions**: [GitHub Discussions](https://github.com/alexg-g/reznet-ai/discussions) - Questions & ideas
- **Changelog**: Check [GitHub Releases](https://github.com/alexg-g/reznet-ai/releases)

## License

MIT License

## Acknowledgments

- Uses [Pi](https://github.com/badlogic/pi-mono) (pi-ai, pi-agent-core) for LLM abstraction and agent runtime
- Uses [Model Context Protocol (MCP)](https://modelcontextprotocol.io) for tool access
- Uses [pgvector](https://github.com/pgvector/pgvector) for semantic memory
- Powered by Anthropic Claude, OpenAI, Google Gemini, Ollama, Groq, and more

---

**Built for developers, by developers**
