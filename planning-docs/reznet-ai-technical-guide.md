# RezNet AI Technical Implementation Guide (Local MVP)

**Version**: 1.0.0-local  
**Last Updated**: January 2025  
**Audience**: Lead Developer / Technical Team  
**Deployment**: Local-only MVP (Single User)

## Product Overview

RezNet AI is a Slack-like chat platform where developers orchestrate teams of AI agents to build software. Each agent has a specialized role (Backend Engineer, Frontend Developer, QA, etc.) and can be mentioned directly or work together through an orchestrator agent. All agents have access to tools via Model Context Protocol (MCP).

**MVP Focus**: Local deployment for proof-of-concept, single-user experience without authentication complexity.

## Cost Analysis for Local MVP

### Required Costs (Monthly)
- **OpenAI API**: $20-100/month for development/testing
  - Use GPT-3.5-turbo primarily (~$0.002/1K tokens)
  - GPT-4 only for complex tasks
  - Aggressive caching reduces usage by 50%+
- **Total Required**: $20-100/month

### Optional Costs
- **GitHub Copilot** (for development): $10/month
- **Anthropic Claude** (alternative LLM): Pay-as-you-go
- **Domain name** (if exposing locally via ngrok): $15/year

### Cost Optimization for Local Development
```python
# config.py - Development settings to minimize costs
DEV_CONFIG = {
    "default_model": "gpt-3.5-turbo",  # 15x cheaper than GPT-4
    "enable_cache": True,
    "cache_ttl": 3600,  # 1 hour
    "max_tokens_per_response": 500,
    "use_embeddings_cache": True,
    "mock_expensive_operations": True
}
```

## Technology Stack (Local MVP)

### Frontend
```yaml
framework: Next.js 14+ (React 18)
language: TypeScript 5.0+
styling: Tailwind CSS 3.4
components: Radix UI / Shadcn UI
state: Zustand
websocket: Socket.io-client
icons: Lucide React
build: Vite / Turbopack
```

### Backend
```yaml
framework: FastAPI 0.110+
language: Python 3.11+
websocket: python-socketio
orchestration: CrewAI 0.30+
async: asyncio + aiohttp
validation: Pydantic 2.0
auth: None (local MVP) / Basic session later
```

### Local Infrastructure
```yaml
database: PostgreSQL 16 + pgvector (Docker)
cache: Redis 7.2 (Docker)
queue: Redis (same instance)
vector_db: pgvector (built into PostgreSQL)
file_storage: Local filesystem
search: PostgreSQL FTS
```

### AI/ML Stack (modular)
```yaml
llm_providers:
  - OpenAI (GPT-4, GPT-3.5)
  - Anthropic (Claude 3)
  - Local models via Ollama
orchestration: CrewAI
embedding: OpenAI text-embedding-3-small
mcp_protocol: Model Context Protocol 1.0
agents: Custom + CrewAI agents
```

### Local Development
```yaml
containers: Docker + Docker Compose
secrets: .env file (local only)
monitoring: Console logs + local dashboard
process_manager: Docker Compose / PM2 (optional)
```

## Project Structure (Simplified for Local MVP)

```
reznet-ai-local/
├── frontend/               # Next.js frontend
│   ├── app/               # App router pages
│   ├── components/        # React components
│   ├── hooks/            # Custom React hooks
│   └── public/           # Static assets
│
├── backend/               # FastAPI backend
│   ├── agents/           # Agent implementations
│   ├── core/             # Core business logic
│   ├── models/           # Database models
│   ├── routers/          # API routes
│   ├── services/         # External services
│   └── websocket/        # WebSocket handlers
│
├── mcp-servers/          # Local MCP servers
│   ├── filesystem/       # File system access
│   ├── github/          # GitHub integration
│   └── database/        # Database access
│
├── data/                 # Local data storage
│   ├── workspaces/      # Project files
│   ├── agent-memory/    # Agent persistence
│   └── uploads/         # User uploads
│
├── docker/
│   └── docker-compose.yml
│
├── scripts/             # Setup and utility scripts
│   ├── setup.sh        # One-click setup
│   └── reset.sh        # Reset local environment
│
├── .env.example         # Environment template
└── README.md           # Quick start guide
```

## Environment Configuration (Local Only)

### Local Development (.env)

```bash
# Local Database (Docker)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/reznetai_local
REDIS_URL=redis://localhost:6379

# No Authentication for MVP
AUTH_ENABLED=false
LOCAL_USER_ID=local-dev-user

# LLM Providers (only what you need)
OPENAI_API_KEY=sk-...

# Optional LLM Providers
# ANTHROPIC_API_KEY=sk-ant-...
# OLLAMA_HOST=http://localhost:11434

# MCP Servers (all local)
MCP_FILESYSTEM_PATH=/home/[your-username]/reznetai/workspace
MCP_GITHUB_TOKEN=ghp_... # Optional, for GitHub access
MCP_SERVER_PORT=3001

# Frontend (local)
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws
NEXT_PUBLIC_AUTH_ENABLED=false

# Local Storage
LOCAL_STORAGE_PATH=./data
UPLOAD_PATH=./data/uploads
WORKSPACE_PATH=./data/workspaces

# Development Settings
DEBUG=true
LOG_LEVEL=info
HOT_RELOAD=true

# Optional: Local Monitoring
ENABLE_LOCAL_METRICS=true
METRICS_PORT=9090
```

## Core Architecture (Local Simplified)

### System Architecture
```
┌─────────────────────┐
│   Next.js Client    │
│   localhost:3000    │
│   - Chat UI         │
│   - Agent Status    │
└──────────┬──────────┘
           │ WebSocket + REST
┌──────────▼──────────┐
│   FastAPI Server    │
│   localhost:8000    │
│   - Message Router  │
│   - Agent Manager   │
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│  CrewAI Orchestrator│
│   - Task Planning   │
│   - Agent Execution │
└──────────┬──────────┘
           │
┌──────────▼──────────────┐
│     Local MCP Servers   │
│  - Filesystem (3001)    │
│  - GitHub (3002)        │
│  - Database (3003)      │
└─────────────────────────┘
```

### Message Flow (Simplified)
```python
# 1. User sends message
WebSocket -> MessageHandler

# 2. Route to appropriate agent
if has_mention:
    agent = get_agent(mention)
    response = agent.process(message)
else:
    response = orchestrator.process(message)

# 3. Stream response back
stream_to_client(response)
```

## Database Schema (Simplified for Local MVP)

```sql
-- Minimal schema for local single-user deployment
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";

-- Single workspace for local user
CREATE TABLE workspace (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) DEFAULT 'Local Workspace',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pre-configured agents
CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    agent_type VARCHAR(50) NOT NULL, -- 'orchestrator', 'backend', 'frontend', etc.
    persona JSONB NOT NULL,
    config JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Channels for organization
CREATE TABLE channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    topic TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Message history
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
    author_id UUID, -- References agent.id or static user id
    author_type VARCHAR(10) NOT NULL, -- 'user' or 'agent'
    author_name VARCHAR(100), -- Display name
    content TEXT NOT NULL,
    thread_id UUID REFERENCES messages(id),
    metadata JSONB DEFAULT '{}', -- tokens_used, model, tools_used, etc.
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Task tracking
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    description TEXT NOT NULL,
    assigned_to UUID REFERENCES agents(id),
    status VARCHAR(50) DEFAULT 'pending',
    context JSONB DEFAULT '{}',
    result JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Agent memory (simplified)
CREATE TABLE agent_memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    content TEXT,
    embedding vector(1536), -- For semantic search
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_messages_channel ON messages(channel_id, created_at DESC);
CREATE INDEX idx_messages_thread ON messages(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX idx_agent_memories_embedding ON agent_memories USING ivfflat (embedding vector_cosine_ops);

-- Initial data for local setup
INSERT INTO workspace (name) VALUES ('Local Development');

INSERT INTO channels (name, topic) VALUES 
    ('general', 'General discussion'),
    ('development', 'Development tasks'),
    ('testing', 'Testing and QA');

INSERT INTO agents (name, agent_type, persona) VALUES
    ('@orchestrator', 'orchestrator', '{"role": "Team Lead", "goal": "Coordinate development tasks", "backstory": "Experienced technical lead"}'),
    ('@backend', 'backend', '{"role": "Backend Engineer", "goal": "Build robust APIs", "backstory": "Python expert"}'),
    ('@frontend', 'frontend', '{"role": "Frontend Developer", "goal": "Create beautiful UIs", "backstory": "React specialist"}'),
    ('@qa', 'qa', '{"role": "QA Engineer", "goal": "Ensure quality", "backstory": "Testing expert"}');
```

## API Specification (Local MVP)

### REST Endpoints (No Authentication)

```python
# FastAPI route definitions - no auth required for local
from fastapi import APIRouter, WebSocket
from typing import List

# Channel endpoints
GET    /api/channels                    # List all channels
POST   /api/channels                    # Create new channel
GET    /api/channels/{channel_id}       # Get channel info
GET    /api/channels/{channel_id}/messages  # Get messages
POST   /api/channels/{channel_id}/messages  # Send message

# Agent endpoints
GET    /api/agents                      # List all agents
POST   /api/agents/{agent_id}/invoke    # Directly invoke agent
GET    /api/agents/{agent_id}/status    # Get agent status

# Task endpoints
GET    /api/tasks                       # List all tasks
GET    /api/tasks/{task_id}            # Get task details
POST   /api/tasks/{task_id}/cancel     # Cancel running task

# System endpoints
GET    /api/health                      # Health check
GET    /api/stats                       # Usage statistics
POST   /api/reset                       # Reset local database (dev only)
```

### WebSocket Events (Simplified)

```python
# WebSocket message types
from enum import Enum
from pydantic import BaseModel

class WSMessageType(Enum):
    # Client -> Server
    MESSAGE_SEND = "message:send"
    AGENT_INVOKE = "agent:invoke"
    TYPING_START = "typing:start"
    
    # Server -> Client
    MESSAGE_NEW = "message:new"
    AGENT_STATUS = "agent:status"
    AGENT_THINKING = "agent:thinking"
    TASK_PROGRESS = "task:progress"
    ERROR = "error"

# Simplified WebSocket handler (no auth)
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            await handle_ws_message(data)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
```

## Agent Implementation

### Base Agent Structure

```python
# agents/base.py
from abc import ABC, abstractmethod
from crewai import Agent as CrewAgent, Task
from typing import Dict, Any, Optional
import asyncio

class BaseAgent(ABC):
    def __init__(self, agent_id: str, config: Dict[str, Any]):
        self.id = agent_id
        self.name = config["name"]
        self.persona = config["persona"]
        self.status = "online"
        self.tools = self._load_tools(config.get("tools", []))
        
        # Initialize CrewAI agent
        self.crew_agent = CrewAgent(
            role=self.persona["role"],
            goal=self.persona["goal"],
            backstory=self.persona["backstory"],
            tools=self.tools,
            llm_model=config.get("model", "gpt-4"),
            max_iterations=5
        )
    
    @abstractmethod
    async def process_message(self, message: str, context: Dict) -> str:
        """Process incoming message and return response"""
        pass
    
    async def execute_task(self, task_description: str) -> Dict[str, Any]:
        """Execute a specific task"""
        task = Task(
            description=task_description,
            agent=self.crew_agent
        )
        result = await asyncio.to_thread(task.execute)
        return {"output": result, "status": "completed"}
    
    def _load_tools(self, tool_configs: List[Dict]) -> List:
        """Load MCP tools for the agent"""
        tools = []
        for config in tool_configs:
            if config["type"] == "github":
                tools.append(GitHubTool(config))
            elif config["type"] == "filesystem":
                tools.append(FileSystemTool(config))
        return tools
```

### Specialist Agent Example

```python
# agents/backend_agent.py
class BackendAgent(BaseAgent):
    async def process_message(self, message: str, context: Dict) -> str:
        # Set agent status
        await self.update_status("thinking")
        
        # Analyze message intent
        intent = self._analyze_intent(message)
        
        if intent == "code_generation":
            response = await self._generate_code(message, context)
        elif intent == "code_review":
            response = await self._review_code(message, context)
        elif intent == "question":
            response = await self._answer_question(message, context)
        else:
            response = await self.crew_agent.execute(message)
        
        await self.update_status("online")
        return response
    
    async def _generate_code(self, requirements: str, context: Dict) -> str:
        prompt = f"""
        As a senior backend engineer, create production-ready code for:
        {requirements}
        
        Context: {context.get('project_type')}
        Language: {context.get('language', 'Python')}
        Framework: {context.get('framework', 'FastAPI')}
        """
        
        result = await self.execute_task(prompt)
        return f"```python\n{result['output']}\n```"
```

## MCP Integration (Local Setup)

### Local MCP Server Configuration

```python
# backend/config/mcp_servers.py
import os
from pathlib import Path

# All MCP servers run locally
MCP_SERVERS = {
    "filesystem": {
        "url": "http://localhost:3001",
        "workspace": str(Path.home() / "reznetai" / "workspace"),
        "enabled": True
    },
    "github": {
        "url": "http://localhost:3002", 
        "token": os.getenv("MCP_GITHUB_TOKEN", ""),
        "enabled": bool(os.getenv("MCP_GITHUB_TOKEN"))
    },
    "database": {
        "url": "http://localhost:3003",
        "connection": os.getenv("DATABASE_URL"),
        "enabled": False  # Optional for MVP
    }
}
```

### Simple MCP Client

```python
# backend/services/mcp_client.py
import httpx
from typing import Dict, Any

class LocalMCPClient:
    """Simplified MCP client for local servers"""
    
    def __init__(self, server_config: Dict[str, Any]):
        self.base_url = server_config["url"]
        self.client = httpx.AsyncClient()
        
    async def invoke_tool(self, tool_name: str, params: Dict) -> Any:
        """Call MCP tool and return result"""
        response = await self.client.post(
            f"{self.base_url}/tools/{tool_name}",
            json=params
        )
        return response.json()
    
    async def list_tools(self) -> List[Dict]:
        """Get available tools from server"""
        response = await self.client.get(f"{self.base_url}/tools")
        return response.json()

# Usage in agents
mcp = LocalMCPClient(MCP_SERVERS["filesystem"])
result = await mcp.invoke_tool("read_file", {"path": "/workspace/main.py"})
```

### Minimal MCP Filesystem Server

```javascript
// mcp-servers/filesystem/server.js
const express = require('express');
const fs = require('fs').promises;
const path = require('path');

const app = express();
app.use(express.json());

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || './workspace';

// Simple file operations
app.post('/tools/read_file', async (req, res) => {
  const filePath = path.join(WORKSPACE_ROOT, req.body.path);
  const content = await fs.readFile(filePath, 'utf-8');
  res.json({ content });
});

app.post('/tools/write_file', async (req, res) => {
  const filePath = path.join(WORKSPACE_ROOT, req.body.path);
  await fs.writeFile(filePath, req.body.content);
  res.json({ success: true });
});

app.post('/tools/list_directory', async (req, res) => {
  const dirPath = path.join(WORKSPACE_ROOT, req.body.path || '');
  const files = await fs.readdir(dirPath);
  res.json({ files });
});

app.listen(3001, () => {
  console.log('MCP Filesystem Server running on port 3001');
});
```

## Local Development Setup

### Docker Compose (All-in-One Local)

```yaml
version: '3.8'

services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: reznetai_local
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
      - ./backend/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql
    ports:
      - "5432:5432"

  redis:
    image: redis:7.2-alpine
    ports:
      - "6379:6379"
    volumes:
      - ./data/redis:/data

  # MCP Filesystem Server
  mcp-filesystem:
    build:
      context: ./mcp-servers/filesystem
    volumes:
      - ./data/workspaces:/workspace
    ports:
      - "3001:3001"
    environment:
      WORKSPACE_ROOT: /workspace

  # Optional: MCP GitHub Server
  # mcp-github:
  #   build:
  #     context: ./mcp-servers/github
  #   ports:
  #     - "3002:3002"
  #   environment:
  #     GITHUB_TOKEN: ${MCP_GITHUB_TOKEN}

volumes:
  postgres_data:
  redis_data:
```

### Quick Start Script (setup.sh)

```bash
#!/bin/bash
# One-click local setup

echo "🚀 Setting up RezNet AI Local..."

# Check prerequisites
command -v docker >/dev/null 2>&1 || { echo "Docker required but not installed. Aborting." >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "Python 3 required but not installed. Aborting." >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "Node.js required but not installed. Aborting." >&2; exit 1; }

# Setup environment
cp .env.example .env
echo "📝 Created .env file - add your OpenAI API key"

# Create data directories
mkdir -p data/{postgres,redis,workspaces,uploads,agent-memory}

# Start Docker services
docker-compose up -d postgres redis
echo "🐳 Started database services"

# Wait for PostgreSQL to be ready
sleep 5

# Install Python dependencies
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
echo "🐍 Installed Python dependencies"

# Run database migrations
python migrate.py
echo "💾 Database initialized"

# Install frontend dependencies
cd ../frontend
npm install
echo "📦 Installed frontend dependencies"

echo "✅ Setup complete! Run ./start.sh to launch RezNet AI"
```

### Start Script (start.sh)

```bash
#!/bin/bash
# Start all services

# Start Docker services
docker-compose up -d

# Start MCP servers (in background)
cd mcp-servers/filesystem && npm start &
MCP_PID=$!

# Start backend
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!

# Start frontend
cd ../frontend
npm run dev &
FRONTEND_PID=$!

echo "🎉 RezNet AI is running!"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:8000"
echo "   MCP:      http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait and handle shutdown
trap "kill $MCP_PID $BACKEND_PID $FRONTEND_PID; docker-compose down" EXIT
wait
```

## Development Workflow

### Initial Setup (One-Time)

```bash
# Clone repository
git clone https://github.com/yourusername/reznetai-local.git
cd reznetai-local

# Run automated setup
chmod +x scripts/setup.sh
./scripts/setup.sh

# Add your OpenAI API key to .env
echo "OPENAI_API_KEY=sk-your-key-here" >> .env

# Start everything
chmod +x scripts/start.sh
./scripts/start.sh
```

### Daily Development

```bash
# Start services
./scripts/start.sh

# Or start individually:
docker-compose up -d         # Database & Redis
cd backend && uvicorn main:app --reload  # Backend
cd frontend && npm run dev   # Frontend

# Reset database (when needed)
./scripts/reset.sh

# View logs
docker-compose logs -f
```

### Adding New Agents

```python
# backend/agents/custom_agent.py
from agents.base import BaseAgent

class CustomAgent(BaseAgent):
    async def process_message(self, message: str, context: dict) -> str:
        # Your agent logic here
        return response

# Register in backend/agents/__init__.py
AGENT_REGISTRY = {
    "custom": CustomAgent,
    # ... other agents
}
```

## Local MCP Server Setup

### Creating a Custom MCP Server

```javascript
// mcp-servers/custom/index.js
const { MCPServer } = require('@modelcontextprotocol/server');

const server = new MCPServer({
  name: 'custom-tool',
  version: '1.0.0'
});

server.addTool({
  name: 'my_tool',
  description: 'Does something useful',
  parameters: {
    type: 'object',
    properties: {
      input: { type: 'string' }
    }
  },
  handler: async ({ input }) => {
    // Tool logic here
    return { result: 'Success' };
  }
});

server.listen(3004);
```

## Performance Tips for Local Development

### Resource Management

```yaml
# Limit resource usage in docker-compose.yml
services:
  postgres:
    mem_limit: 512m
    cpus: '0.5'
  
  redis:
    mem_limit: 256m
    cpus: '0.25'
```

### Token Usage Optimization

```python
# Use GPT-3.5 for development to save costs
DEVELOPMENT_CONFIG = {
    "default_model": "gpt-3.5-turbo",
    "max_tokens": 1000,
    "temperature": 0.7,
    "cache_responses": True,
    "cache_ttl": 3600  # 1 hour
}
```

## Troubleshooting

### Common Issues

1. **Port already in use**
   ```bash
   # Find and kill process using port
   lsof -i :3000  # or :8000, :5432
   kill -9 <PID>
   ```

2. **Database connection failed**
   ```bash
   # Restart PostgreSQL container
   docker-compose restart postgres
   # Check logs
   docker-compose logs postgres
   ```

3. **Agent not responding**
   - Check OpenAI API key in .env
   - Verify rate limits not exceeded
   - Check backend logs for errors

4. **WebSocket disconnects**
   - Ensure both frontend and backend are running
   - Check CORS settings if modified

## Optional Enhancements

### Using Local LLMs with Ollama

```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull a model
ollama pull llama2

# Update .env
OLLAMA_HOST=http://localhost:11434
USE_LOCAL_LLM=true
```

### Adding Voice Input

```javascript
// frontend/components/VoiceInput.jsx
const VoiceInput = () => {
  const recognition = new webkitSpeechRecognition();
  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    sendMessage(transcript);
  };
  // ...
};
```

## Development Best Practices

1. **Test with cheap models first** (GPT-3.5)
2. **Use caching aggressively** for development
3. **Keep chat histories small** during testing
4. **Mock expensive operations** when possible
5. **Use Docker volumes** for data persistence

## Quick Commands

```bash
# Reset everything
docker-compose down -v
rm -rf data/*
./scripts/setup.sh

# Backup local data
tar -czf backup.tar.gz data/

# View real-time logs
tail -f backend/logs/app.log

# Connect to database
docker exec -it reznetai-local_postgres_1 psql -U postgres -d reznetai_local

# Clear Redis cache
docker exec -it reznetai-local_redis_1 redis-cli FLUSHALL
```

## Summary: Key Differences for Local MVP

### What We Removed
- ❌ Multi-user authentication & authorization
- ❌ Workspace/tenant management  
- ❌ Cloud deployment configuration
- ❌ S3/MinIO object storage
- ❌ External monitoring (Sentry, PostHog)
- ❌ Complex user management

### What We Kept
- ✅ Full agent orchestration (CrewAI)
- ✅ MCP tool integration
- ✅ Slack-like chat interface
- ✅ WebSocket real-time messaging
- ✅ PostgreSQL with pgvector for memory
- ✅ Redis for caching

### Why This Approach Works
1. **Zero infrastructure costs** - Everything runs on your machine
2. **Rapid iteration** - No deployment pipeline to slow you down
3. **Full functionality** - All core features work identically
4. **Easy to demo** - Can run on any laptop for investors/users
5. **Simple to extend** - Add multi-user later when validated

### Next Steps After MVP Validation
1. Add basic authentication
2. Implement workspace isolation
3. Deploy to cloud (Railway/Fly.io)
4. Add usage analytics
5. Implement billing/subscriptions

---

**Remember**: This local MVP is designed to prove the concept with minimal cost and complexity. Once validated with users, the architecture easily scales to support multiple users and cloud deployment.
