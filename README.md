# RezNet AI - Local MVP

> AI Agent Collaboration Platform for Software Development

RezNet AI is a Slack-like chat platform where developers orchestrate teams of AI agents to build software. Each agent has a specialized role (Backend Engineer, Frontend Developer, QA, DevOps, Orchestrator) and can be mentioned directly or work together.

**Status**: Local MVP - Single User Development Environment

---

## 🌟 Features

- **Multi-Agent System**: Coordinate specialized AI agents for different development tasks
- **Real-time Chat Interface**: Slack-like UI with WebSocket communication
- **MCP Integration**: Model Context Protocol for filesystem and GitHub operations
- **Multi-LLM Support**: Works with Anthropic Claude, OpenAI, or local Ollama models
- **Agent Memory**: RAG-based context awareness across conversations
- **Task Tracking**: Built-in task management and delegation

## 🏗️ Architecture

```
┌─────────────────────┐
│   Next.js Client    │  ← Chat UI
│   localhost:3000    │
└──────────┬──────────┘
           │ WebSocket + REST
┌──────────▼──────────┐
│   FastAPI Server    │  ← Message Router
│   localhost:8000    │     Agent Manager
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│ AI Agent Team       │
│ • @orchestrator     │  ← Coordinates tasks
│ • @backend          │  ← Python/API expert
│ • @frontend         │  ← React/UI expert
│ • @qa               │  ← Testing specialist
│ • @devops           │  ← Infrastructure expert
└──────────┬──────────┘
           │
┌──────────▼──────────────┐
│  MCP Servers (Local)    │
│  • Filesystem (3001)    │
│  • GitHub (3002)        │
└─────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- **Docker Desktop** (for PostgreSQL + Redis)
- **Python 3.11+**
- **Node.js 18+**
- **Anthropic API Key** (or OpenAI/Ollama)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/reznet-ai.git
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
- Install Python dependencies
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
- Frontend: http://localhost:3000 (after setup)

## 🤖 Available Agents

### @orchestrator
**Role**: Team Lead & Project Orchestrator

Coordinates development tasks, breaks down complex requirements, and delegates to specialist agents.

### @backend
**Role**: Senior Backend Engineer
Specializes in Python, FastAPI, databases, and server-side logic.

### @frontend
**Role**: Senior Frontend Developer
Expert in React, Next.js, TypeScript, Tailwind CSS, and modern UI/UX.

### @qa
**Role**: QA Engineer & Testing Specialist
Writes comprehensive tests, finds edge cases, ensures code quality.

### @devops
**Role**: DevOps Engineer
Manages infrastructure, Docker, CI/CD, deployment, and monitoring.

## 💬 Usage Examples

### Via Chat Interface
Open http://localhost:3000 and interact with agents:

```
# Direct agent mention
@backend How do I implement JWT authentication in FastAPI?

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
    "message": "Explain how to implement JWT authentication in FastAPI",
    "context": {}
  }'

# Clear channel context
curl -X POST http://localhost:8000/api/channels/{channel_id}/clear \
  -H "Content-Type: application/json"
```

### Via WebSocket
Connect to `ws://localhost:8000/ws` and send messages that mention agents like `@backend`, `@frontend`, etc.

## 📁 Project Structure

```
reznet-ai/
├── backend/               # FastAPI backend
│   ├── agents/           # AI agent implementations
│   ├── core/             # Core utilities
│   ├── models/           # Data models
│   ├── routers/          # API routes
│   ├── websocket/        # WebSocket handling
│   └── main.py           # FastAPI app
│
├── mcp-servers/          # MCP servers
│   ├── filesystem/       # File system operations
│   └── github/          # GitHub integration
│
├── frontend/             # Next.js frontend (to be set up)
├── data/                 # Local data storage
├── scripts/             # Automation scripts
└── docker-compose.yml   # Docker services
```

## 🔧 Development

### Running Services Individually

**Backend**:
```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload
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

### Stop All Services

```bash
./scripts/stop.sh
```

### Reset Database

```bash
./scripts/reset.sh
```

## 🐛 Troubleshooting

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

## 📊 API Documentation

Interactive API docs available at:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## 🛣️ Roadmap

### Current (v1.0 - Local MVP)
- ✅ Multi-agent system
- ✅ Real-time WebSocket communication
- ✅ Multi-LLM support (Anthropic, OpenAI, Ollama)
- ✅ MCP integration (Filesystem, GitHub)
- ✅ Task management
- ⏳ Frontend UI (in progress)

### Next Steps
- Complete frontend implementation
- Agent memory and context persistence
- Code execution capabilities
- Voice input/output
- Advanced task visualization

### Future
- Multi-user support
- Cloud deployment
- Usage analytics
- Plugin system for custom agents

## 📄 License

MIT License

## 🙏 Acknowledgments

- Built with [CrewAI](https://github.com/joaomdmoura/crewAI)
- Uses [Model Context Protocol (MCP)](https://modelcontextprotocol.io)
- Powered by Anthropic Claude, OpenAI, and Ollama

---

**Built for developers, by developers** 🚀
