# Semantic Memory System Guide

## Overview

The Semantic Memory System adds intelligent long-term memory to RezNet AI agents **without requiring CrewAI or any framework lock-in**. It maintains **100% control over system prompts** while providing sophisticated context management.

### Key Features

- ✅ **Semantic Retrieval**: Find relevant past context using pgvector similarity search
- ✅ **Automatic Memory Storage**: Conversations automatically stored with embeddings
- ✅ **Context Summarization**: Condense old conversations to preserve key information
- ✅ **Entity Extraction**: Track people, files, and concepts mentioned
- ✅ **Full Prompt Control**: Zero framework injections, users control every character
- ✅ **Configurable**: Per-agent memory settings, window sizes, importance scoring
- ✅ **Channel-Aware**: Memories scoped to specific channels for context relevance

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   BaseAgentWithMemory                   │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │ 100% User-Controlled System Prompt                │ │
│  │ (No framework injections)                         │ │
│  └───────────────────────────────────────────────────┘ │
│                         │                               │
│                         ▼                               │
│  ┌───────────────────────────────────────────────────┐ │
│  │ SemanticMemoryManager                             │ │
│  │  • Retrieve relevant memories (pgvector search)   │ │
│  │  • Store new memories with embeddings             │ │
│  │  • Summarize old context                          │ │
│  │  • Extract entities                               │ │
│  └───────────────────────────────────────────────────┘ │
│                         │                               │
│                         ▼                               │
│  ┌───────────────────────────────────────────────────┐ │
│  │ PostgreSQL + pgvector                             │ │
│  │  agent_memories table with 1536-dim embeddings    │ │
│  └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## Installation

### 1. Install Dependencies

```bash
cd backend
pip install -r requirements.txt  # Includes pgvector>=0.2.4
```

### 2. Install pgvector Extension

**Mac (Homebrew)**:
```bash
brew install pgvector
```

**Ubuntu/Debian**:
```bash
sudo apt install postgresql-16-pgvector
```

**Docker** (update docker-compose.yml):
```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16  # Use pgvector-enabled image
```

### 3. Run Database Migration

```bash
cd backend
python migrations/run_migration.py
```

This will:
- Enable pgvector extension
- Create `agent_memories` table
- Create indexes for fast semantic search

### 4. Configure Environment

Ensure your `.env` has OpenAI API key (for embeddings):

```bash
OPENAI_API_KEY=sk-your-key-here
ENABLE_AGENT_MEMORY=true
```

---

## Usage

### Basic: Upgrade Existing Agent to Use Memory

**Before** (agents/specialists.py):
```python
from agents.base import BaseAgent

class BackendAgent(BaseAgent):
    """Backend development specialist"""
    pass
```

**After**:
```python
from agents.base_with_memory import BaseAgentWithMemory

class BackendAgent(BaseAgentWithMemory):
    """Backend development specialist with semantic memory"""
    pass
```

That's it! The agent now has semantic memory with zero changes to system prompts.

### Configure Memory Behavior

Per-agent memory configuration via `config` dict:

```python
agent = BackendAgent(
    agent_id=uuid.uuid4(),
    name="@backend",
    agent_type="backend",
    persona={"role": "Backend Developer", ...},
    config={
        "enable_memory": True,               # Enable/disable memory
        "memory_window_size": 50,            # Keep 50 messages in context
        "enable_auto_summarization": True,   # Auto-summarize old context
        "enable_entity_extraction": False,   # Extract entities (slower)
    },
    db=db_session  # Database session for memory operations
)
```

### Integration with Processor

Update `agents/processor.py` to use memory-enabled agents:

```python
from agents.base_with_memory import BaseAgentWithMemory
from agents.specialists import BackendAgent, FrontendAgent, ...

def get_agent_instance(agent_record: Agent, db: Session) -> Any:
    """Get or create agent instance with memory support"""

    agent_class = AGENT_CLASSES.get(agent_record.agent_type)
    if not agent_class:
        return None

    # Create agent instance with database session
    agent = agent_class(
        agent_id=agent_record.id,
        name=agent_record.name,
        agent_type=agent_record.agent_type,
        persona=agent_record.persona,
        config=agent_record.config,
        db=db  # Pass DB session for memory operations
    )

    return agent
```

### Programmatic Memory Access

```python
# Get memory statistics
stats = agent.get_memory_stats(channel_id=channel_id)
# Returns: {
#   'enabled': True,
#   'total_memories': 150,
#   'by_type': {'conversation': 120, 'decision': 10, ...},
#   'average_importance': 5.2,
#   'window_size': 50
# }

# Create a summary
summary = await agent.create_memory_summary(channel_id=channel_id)
# Returns: "The team discussed implementing user authentication..."

# Clean up old memories
deleted_count = await agent.clear_old_memories(days_old=30)
# Returns: 45 (number of deleted memories)
```

### Advanced: Direct Memory Manager Usage

For fine-grained control, use `SemanticMemoryManager` directly:

```python
from agents.memory_manager import SemanticMemoryManager
from uuid import UUID

memory_manager = SemanticMemoryManager(
    agent_id=agent_id,
    db=db_session,
    embedding_provider="openai",
    window_size=50
)

# Store a decision
await memory_manager.store(
    content="Decided to use PostgreSQL for database",
    memory_type="decision",
    importance=8,
    channel_id=channel_id,
    metadata={"participants": ["@backend", "@devops"]}
)

# Retrieve relevant memories
memories = await memory_manager.retrieve_relevant(
    query="What database are we using?",
    limit=5,
    memory_types=["decision", "conversation"],
    channel_id=channel_id,
    min_importance=5
)
# Returns: [
#   {
#     'content': 'Decided to use PostgreSQL...',
#     'memory_type': 'decision',
#     'importance': 8,
#     'relevance_score': 0.87,
#     'metadata': {...},
#     ...
#   },
#   ...
# ]

# Create summary
summary = await memory_manager.create_summary(
    llm_client=agent.llm,
    channel_id=channel_id,
    memory_count=20
)

# Extract entities
entities = await memory_manager.extract_and_store_entities(
    text="We're using FastAPI with PostgreSQL and Redis",
    llm_client=agent.llm,
    channel_id=channel_id
)
# Returns: ['FastAPI', 'PostgreSQL', 'Redis']
```

---

## Memory Types

| Type | Description | Use Case | Default Importance |
|------|-------------|----------|-------------------|
| `conversation` | Chat messages | User-agent interactions | 5 |
| `decision` | Important decisions | Architectural choices, agreements | 8 |
| `entity` | Extracted entities | People, files, technologies | 6 |
| `summary` | Context summaries | Condensed old conversations | 7 |
| `tool_use` | Tool call records | File operations, API calls | 4 |

### Importance Scoring (1-10 scale)

- **1-3**: Low importance (routine messages, can be pruned)
- **4-6**: Medium importance (normal conversations)
- **7-8**: High importance (decisions, key entities)
- **9-10**: Critical importance (never prune)

Importance affects:
- Retrieval priority (higher importance = more likely to be retrieved)
- Automatic cleanup (low importance memories deleted first)

---

## How Context Building Works

When an agent processes a message:

### 1. **Recent Context** (last 10 messages from DB)
```python
"Recent Conversation:"
- User: Can you add a login page?
- @backend: I'll create the authentication endpoint first.
```

### 2. **Semantic Retrieval** (top 5 relevant from history)
```python
"Relevant Past Context (from long-term memory):"
- [0.82] Decided to use JWT authentication for API
- [0.76] Created user database schema with email/password fields
- [0.71] @frontend: Login form should have email and password inputs
```

### 3. **Context Summary** (if available)
```python
"Previous Context Summary:"
The team is building a user authentication system using JWT tokens.
Backend API endpoints are complete. Frontend forms are in progress.
```

### Combined Prompt
All of this is added to the prompt **before** your custom system prompt, giving the agent rich context while maintaining full prompt control.

---

## Performance Optimization

### Vector Index

The migration creates an HNSW index for fast approximate nearest neighbor search:

```sql
CREATE INDEX idx_agent_memories_embedding ON agent_memories
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

This makes semantic search ~100x faster than brute-force comparison.

### Caching

Memory retrieval is optimized with:
- Recent message exclusion (don't retrieve what's already in context)
- Importance filtering (only retrieve memories above threshold)
- Access tracking (popular memories retrieved faster)

### Cleanup

Prevent database bloat with periodic cleanup:

```python
# Run periodically (cron job or background task)
await agent.clear_old_memories(days_old=30)  # Delete low-importance memories > 30 days old
```

---

## API Endpoints (Optional)

Add REST endpoints for memory management:

```python
# routers/memories.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from uuid import UUID

router = APIRouter()

@router.get("/agents/{agent_id}/memory/stats")
async def get_memory_stats(
    agent_id: UUID,
    channel_id: UUID = None,
    db: Session = Depends(get_db)
):
    """Get agent memory statistics"""
    agent = get_agent_instance_by_id(agent_id, db)
    return agent.get_memory_stats(channel_id=channel_id)

@router.post("/agents/{agent_id}/memory/summarize")
async def create_summary(
    agent_id: UUID,
    channel_id: UUID = None,
    db: Session = Depends(get_db)
):
    """Create a summary of agent's memories"""
    agent = get_agent_instance_by_id(agent_id, db)
    summary = await agent.create_memory_summary(channel_id=channel_id)
    return {"summary": summary}

@router.delete("/agents/{agent_id}/memory/cleanup")
async def cleanup_memories(
    agent_id: UUID,
    days_old: int = 30,
    db: Session = Depends(get_db)
):
    """Clean up old memories"""
    agent = get_agent_instance_by_id(agent_id, db)
    deleted = await agent.clear_old_memories(days_old=days_old)
    return {"deleted_count": deleted}
```

---

## Troubleshooting

### "pgvector extension not found"

```bash
# Install pgvector for your PostgreSQL version
brew install pgvector  # Mac
sudo apt install postgresql-16-pgvector  # Ubuntu

# Then run migration again
python migrations/run_migration.py
```

### "OPENAI_API_KEY required for embeddings"

Semantic memory uses OpenAI's embedding API. Set in `.env`:

```bash
OPENAI_API_KEY=sk-your-key-here
```

### "Memory not enabled for this agent"

Ensure config has `enable_memory: True`:

```python
agent = BackendAgent(
    ...,
    config={"enable_memory": True},
    db=db_session  # Required!
)
```

### Slow Semantic Search

Check if vector index exists:

```sql
SELECT indexname FROM pg_indexes
WHERE tablename = 'agent_memories' AND indexname LIKE '%embedding%';
```

If missing, re-run migration.

---

## Comparison to CrewAI

| Feature | Semantic Memory System | CrewAI |
|---------|------------------------|--------|
| **System Prompt Control** | 100% user control | Framework injections |
| **Semantic Retrieval** | ✅ pgvector | ✅ Built-in |
| **Context Summarization** | ✅ Custom LLM calls | ✅ Automatic |
| **Entity Tracking** | ✅ Optional | ✅ Automatic |
| **Framework Lock-in** | ❌ None | ✅ Heavy |
| **Complexity** | Simple Python | CrewAI abstractions |
| **User Customization** | Full control | Limited |
| **Setup Effort** | Medium | Low |

**Bottom line**: Our system gives you **most of CrewAI's memory benefits** without **losing control over system prompts** or **framework lock-in**.

---

## Future Enhancements

Potential improvements:

1. **Multi-Modal Memories**: Store images, code snippets with embeddings
2. **Memory Sharing**: Share memories across agents in a team
3. **Importance Learning**: ML-based importance scoring
4. **Compression**: Automatic old memory compression
5. **Memory Export**: Export memories for backup/analysis
6. **Ollama Embeddings**: Support local embedding models

---

## Examples

### Example 1: Agent Remembers Past Decisions

```
Day 1:
User: "@backend We should use PostgreSQL for the database"
@backend: "Sounds good, I'll set up PostgreSQL. ✓ Stored decision memory"

Day 30 (29 days later, outside 10-message window):
User: "@backend What database are we using?"
@backend: "We're using PostgreSQL as discussed earlier. [Retrieved from memory]"
```

The agent retrieved the decision from day 1 using semantic search!

### Example 2: Cross-Channel Context

```
Channel #planning:
User: "@backend Create user authentication"
@backend: "I'll use JWT tokens" ✓ Stored

Channel #implementation (different channel):
User: "@backend Show me the auth code"
@backend: "Here's the JWT-based authentication..." [Retrieved from #planning]
```

Memories can be scoped to channels or shared across them.

### Example 3: Entity Tracking

```
User: "@backend We need to integrate with Stripe API and save data to Redis cache"
@backend: "Got it" ✓ Stored entities: [Stripe, Redis]

Later:
User: "@backend What services are we integrating?"
@backend: "We're integrating with Stripe API and using Redis cache"
[Retrieved entities from memory]
```

---

## License

This semantic memory system is part of RezNet AI and follows the project's license.

**Key principle**: Full control, zero framework lock-in.
