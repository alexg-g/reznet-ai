# Custom Agent Configuration Guide

## Overview

Custom agents created by users automatically inherit **all features** of the built-in specialist agents, including:

✅ **Semantic Memory** (pgvector + Ollama embeddings)
✅ **Multi-LLM Support** (Anthropic, OpenAI, Ollama)
✅ **Real-time Chat** (WebSocket streaming)
✅ **Tool Access** (MCP servers)
✅ **Workflow Orchestration** (if configured as orchestrator)

**No additional configuration required** - custom agents work out of the box!

---

## How Custom Agents Get Full Functionality

### Architecture

When you create a custom agent via `/api/agent-templates/{id}/instantiate`:

1. **Agent stored in database** with:
   - `agent_type` = 'custom' or domain name
   - `persona` = display name, color, icon
   - `config` = system_prompt, available_tools, llm_config

2. **At runtime**, `processor.py` automatically:
   - Detects agent type not in built-in list
   - Uses `CustomAgent` class (inherits `BaseAgentWithMemory`)
   - Passes DB session for semantic memory
   - Loads system prompt from `config['system_prompt']`

3. **Result**: Custom agent has identical capabilities to built-in agents!

---

## Required Configuration Fields

When creating a custom agent, ensure these fields are set:

### 1. Agent Template (via `/api/agent-templates`)

```json
{
  "name": "marketing-analyst",
  "display_name": "Marketing Analyst",
  "role": "Marketing Strategy Specialist",
  "system_prompt": "You are an expert marketing analyst...",
  "color": "#FF6B6B",
  "icon": "📊",
  "available_tools": ["filesystem", "github"],
  "llm_config": {
    "llm_provider": "anthropic",
    "model": "claude-3-5-sonnet-20241022",
    "temperature": 0.7
  },
  "domain": "marketing"
}
```

### 2. Agent Instance (auto-created via `/instantiate`)

The instantiation endpoint creates an `Agent` record with:

```python
Agent(
    name="@marketing-analyst",
    agent_type="marketing",  # Uses domain, or 'custom' if no domain
    persona={
        'role': template.role,
        'display_name': template.display_name,
        'color': template.color,
        'icon': template.icon,
        ...
    },
    config={
        'system_prompt': template.system_prompt,  # ✅ Used by CustomAgent!
        'available_tools': template.available_tools,
        'template_id': str(template.id),
        **template.llm_config  # Merges llm_provider, model, temperature
    }
)
```

---

## Inherited Functionality Breakdown

### ✅ Semantic Memory (Automatic)

**What custom agents get:**
- Automatic memory storage during conversations
- Semantic retrieval of past context (50+ messages back)
- Shared memory space with other agents
- Memory APIs (`/memory/stats`, `/memory/search`, etc.)

**Configuration:**
```bash
# .env (applies to ALL agents, including custom)
ENABLE_AGENT_MEMORY=true
DEFAULT_EMBEDDING_PROVIDER=ollama
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

**Per-agent override (optional):**
```python
# In agent config
{
  "enable_memory": true,  # Override global setting
  "memory_window_size": 50,  # Number of recent messages
  "enable_auto_summarization": true
}
```

---

### ✅ Multi-LLM Support (Configurable)

**Global default:**
```bash
# .env
DEFAULT_LLM_PROVIDER=anthropic
```

**Per-agent override:**
```json
{
  "llm_config": {
    "llm_provider": "ollama",  # This agent uses Ollama
    "model": "llama3.2",
    "temperature": 0.8
  }
}
```

**Example mixed configuration:**
- Built-in orchestrator: Claude Sonnet 4.5
- Built-in specialists: Llama 3.2
- Custom marketing agent: GPT-4
- **All agents:** Ollama embeddings (free!)

---

### ✅ Tool Access (MCP Servers)

**Available tools:**
```json
{
  "available_tools": [
    "filesystem",  // Read/write files
    "github",      // Git operations, PRs, issues
    "database"     // SQL queries (if enabled)
  ]
}
```

**How it works:**
- `CustomAgent.get_tools()` reads from `config['available_tools']`
- Returns list of MCP server access permissions
- Agent can invoke tools during message processing

---

### ✅ System Prompt (100% User Control)

**Custom agents load system prompts dynamically:**

```python
class CustomAgent(BaseAgentWithMemory):
    def get_system_prompt(self) -> str:
        # Uses config['system_prompt'] set by user
        return self._custom_system_prompt
```

**No framework injections** - users have complete control!

**Example:**
```json
{
  "system_prompt": "You are an expert legal analyst specializing in contract review.

Your capabilities:
- Review contracts for legal issues
- Identify risks and liabilities
- Suggest improvements
- Explain legal terminology

Always provide citations and reasoning for your analysis."
}
```

---

## Testing Custom Agents

### 1. Create Agent Template

```bash
curl -X POST http://localhost:8000/api/agent-templates \
  -H "Content-Type: application/json" \
  -d '{
    "name": "legal-analyst",
    "display_name": "Legal Analyst",
    "role": "Contract Review Specialist",
    "system_prompt": "You are an expert legal analyst...",
    "color": "#4A90E2",
    "icon": "⚖️",
    "available_tools": ["filesystem"],
    "llm_config": {
      "llm_provider": "anthropic",
      "model": "claude-3-5-sonnet-20241022"
    },
    "domain": "legal"
  }'
```

### 2. Instantiate Agent

```bash
curl -X POST http://localhost:8000/api/agent-templates/{template_id}/instantiate
```

### 3. Test in Chat

```
@legal-analyst Review this contract for potential issues
```

### 4. Verify Memory Works

```bash
# After some conversation, check memory stats
curl http://localhost:8000/api/agents/{agent_id}/memory/stats

# Search memories
curl -X POST "http://localhost:8000/api/agents/{agent_id}/memory/search?query=contract&limit=5"
```

---

## Configuration Checklist

When creating a custom agent, ensure:

- [ ] **System prompt** defined in template (10-10000 chars)
- [ ] **Display name** set for UI
- [ ] **Color** set (hex format: #RRGGBB)
- [ ] **Icon** set (emoji or icon, max 10 chars)
- [ ] **Available tools** specified (array of MCP server names)
- [ ] **LLM config** set if overriding global provider
- [ ] **Domain** set if agent belongs to a category

**All other functionality is automatic!**

---

## Advanced: Per-Agent Memory Configuration

Override memory settings for specific custom agents:

```json
{
  "config": {
    "system_prompt": "...",
    "available_tools": ["filesystem"],
    "llm_config": {...},

    // Memory overrides (optional)
    "enable_memory": true,
    "memory_window_size": 100,  // Larger context window
    "enable_auto_summarization": false,  // Disable for this agent
    "enable_entity_extraction": true  // Enable entity tracking
  }
}
```

---

## Example: Marketing Team Custom Agents

Create a full marketing team with custom agents:

### 1. Content Writer
```json
{
  "name": "content-writer",
  "system_prompt": "You write engaging marketing content...",
  "llm_config": {"llm_provider": "openai", "model": "gpt-4"},
  "domain": "marketing"
}
```

### 2. SEO Specialist
```json
{
  "name": "seo-specialist",
  "system_prompt": "You optimize content for search engines...",
  "llm_config": {"llm_provider": "anthropic"},
  "domain": "marketing"
}
```

### 3. Social Media Manager
```json
{
  "name": "social-media",
  "system_prompt": "You create social media strategies...",
  "llm_config": {"llm_provider": "ollama", "model": "llama3.2"},
  "domain": "marketing"
}
```

**All 3 agents automatically get:**
- Semantic memory (shared Ollama embeddings)
- Real-time chat capabilities
- Tool access (filesystem for drafts)
- Ability to @mention each other

---

## Key Takeaways

1. **No special config needed** - custom agents automatically inherit everything
2. **System prompt = full control** - define agent behavior completely
3. **Memory works automatically** - just enable `ENABLE_AGENT_MEMORY=true`
4. **LLM flexibility** - mix and match providers per agent
5. **Same APIs** - `/memory/stats`, `/memory/search`, etc. work for all agents

**Custom agents are first-class citizens** - they have identical capabilities to built-in agents!

---

## Implementation Details (For Developers)

### How CustomAgent Class Works

```python
class CustomAgent(BaseAgentWithMemory):
    def __init__(self, ...config...):
        super().__init__(...)  # Gets BaseAgentWithMemory features

        # Load custom config
        self._custom_system_prompt = config.get('system_prompt')
        self._available_tools = config.get('available_tools', [])

    def get_system_prompt(self):
        return self._custom_system_prompt  # User-defined!

    def get_tools(self):
        return self._available_tools  # User-defined!
```

### Processor Integration

```python
def get_agent_instance(agent_record, db):
    agent_class = AGENT_CLASSES.get(agent_record.agent_type)

    if not agent_class:
        # Fallback to CustomAgent for user-created agents
        agent_class = CustomAgent

    return agent_class(
        ...agent_record...,
        db=db  # Passes DB session for memory
    )
```

**Result:** Any agent not in `AGENT_CLASSES` automatically uses `CustomAgent` with full memory support!

---

## Support

- **API Docs**: http://localhost:8000/docs (see agent-templates endpoints)
- **Memory Guide**: `backend/SEMANTIC_MEMORY_GUIDE.md`
- **Issue #18**: Custom agent creation feature
- **Issue #2**: Semantic memory implementation

---

**Last Updated**: 2025-01-13 (Issue #2 completion)
