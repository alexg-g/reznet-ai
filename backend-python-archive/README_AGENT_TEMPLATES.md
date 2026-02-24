# Agent Templates - Quick Start Guide

## What are Agent Templates?

Agent Templates allow you to create reusable configurations for AI agents with custom:
- System prompts (personality and behavior)
- LLM settings (model, temperature, max tokens)
- Visual identity (color, icon)
- Domain categorization (marketing, legal, research, etc.)

## Quick Start

### 1. Setup Database Table

First time only - create the table and seed default templates:

```bash
cd backend
source venv/bin/activate
python init_agent_templates_table.py
```

You should see:
```
✅ SUCCESS - Agent templates table is ready!
✅ Seeded 5 default templates
```

### 2. Start the Backend

```bash
# From project root
./scripts/start.sh

# Or manually
docker-compose up -d
cd backend && source venv/bin/activate && uvicorn main:app --reload
```

### 3. Explore the API

Open the interactive API docs: http://localhost:8000/docs

Look for the **agent-templates** section with 7 endpoints.

---

## Usage Examples

### List All Templates

```bash
curl http://localhost:8000/api/agent-templates
```

**Response**:
```json
{
  "templates": [
    {
      "id": "uuid",
      "name": "backend",
      "display_name": "Backend Engineer",
      "role": "Python/FastAPI Backend Developer",
      "system_prompt": "You are a Backend Engineer...",
      "color": "#00F6FF",
      "icon": "⚙️",
      "template_type": "default",
      "domain": "software-dev",
      "is_public": true
    },
    ...
  ],
  "total": 5,
  "default_templates": 5,
  "custom_templates": 0
}
```

### Create Custom Template

Save as `my_template.json`:
```json
{
  "name": "legal-advisor",
  "display_name": "Legal Advisor",
  "role": "Corporate Law Specialist",
  "system_prompt": "You are a legal advisor specializing in corporate law, contract review, and compliance. You provide clear, actionable legal guidance.",
  "color": "#FFD700",
  "icon": "⚖️",
  "domain": "legal",
  "llm_config": {
    "provider": "anthropic",
    "model": "claude-3-5-sonnet-20241022",
    "temperature": 0.3
  }
}
```

Then create it:
```bash
curl -X POST http://localhost:8000/api/agent-templates \
  -H "Content-Type: application/json" \
  -d @my_template.json
```

### Instantiate Agent from Template

After creating a template, get its ID from the response, then:

```bash
curl -X POST http://localhost:8000/api/agent-templates/{template-id}/instantiate
```

This creates a new agent in the `agents` table that can be used with @mentions in chat!

### Filter Templates

By domain:
```bash
curl "http://localhost:8000/api/agent-templates?domain=legal"
```

By type:
```bash
curl "http://localhost:8000/api/agent-templates?template_type=custom"
```

### Update Template

Save updates as `update.json`:
```json
{
  "display_name": "Senior Legal Advisor",
  "system_prompt": "You are a senior legal advisor with 15+ years experience..."
}
```

```bash
curl -X PUT http://localhost:8000/api/agent-templates/{template-id} \
  -H "Content-Type: application/json" \
  -d @update.json
```

**Note**: Cannot update default templates (backend, frontend, qa, devops, orchestrator)

### Delete Template

```bash
curl -X DELETE http://localhost:8000/api/agent-templates/{template-id}
```

**Note**: Cannot delete default templates

---

## Template Fields Reference

### Required Fields

- **name**: Unique identifier (lowercase, alphanumeric + hyphens)
  - Examples: `marketing-strategist`, `legal-advisor`, `data-scientist`
  - Pattern: `^[a-z0-9-]+$`
  - Length: 1-100 characters

- **display_name**: Human-readable name shown in UI
  - Examples: "Marketing Strategist", "Legal Advisor"
  - Length: 1-100 characters

- **role**: Agent's role or job title
  - Examples: "Content Marketing Expert", "Corporate Law Specialist"
  - Length: 1-200 characters

- **system_prompt**: Base system prompt defining agent behavior
  - Examples: "You are a marketing expert who...", "You specialize in..."
  - Length: 10-10,000 characters
  - Tip: Be specific about capabilities, tone, and expected outputs

### Optional Fields

- **color**: Hex color for UI display
  - Examples: `#FF1493`, `#00F6FF`, `#FFD700`
  - Pattern: `^#[0-9A-Fa-f]{6}$`

- **icon**: Emoji or icon character
  - Examples: `📊`, `⚖️`, `🎨`, `🚀`
  - Length: Max 10 characters

- **domain**: Category for grouping templates
  - Examples: `software-dev`, `marketing`, `legal`, `research`, `finance`
  - Length: Max 100 characters

- **available_tools**: List of MCP server names agent can access
  - Examples: `["filesystem", "github", "database"]`
  - Default: `[]`

- **llm_config**: LLM provider configuration
  - `provider`: `anthropic`, `openai`, or `ollama`
  - `model`: Model identifier (e.g., `claude-3-5-sonnet-20241022`)
  - `temperature`: 0.0-2.0 (creativity level)
  - `max_tokens`: Maximum response length

---

## Default Templates

The system comes with 5 pre-configured templates:

| Name | Domain | Color | Icon | Role |
|------|--------|-------|------|------|
| orchestrator | software-dev | #9D00FF | 🎯 | Project Manager & Task Coordinator |
| backend | software-dev | #00F6FF | ⚙️ | Python/FastAPI Backend Developer |
| frontend | software-dev | #FF00F7 | 🎨 | React/Next.js Frontend Developer |
| qa | software-dev | #39FF14 | ✅ | Testing & Quality Assurance Engineer |
| devops | software-dev | #FF6B00 | 🚀 | Infrastructure & Deployment Specialist |

**Protection**: Default templates cannot be modified or deleted.

---

## Best Practices

### System Prompt Design

1. **Be Specific**: Define exact capabilities and knowledge areas
2. **Set Expectations**: Clarify response format and tone
3. **Add Constraints**: Specify what the agent should NOT do
4. **Include Examples**: Show desired output patterns

Example:
```
You are a marketing strategist specializing in B2B SaaS content marketing.

CAPABILITIES:
- Content strategy development
- SEO optimization
- Competitive analysis
- Email campaign design

RESPONSE FORMAT:
- Provide actionable recommendations
- Include metrics and KPIs
- Cite best practices
- Use bullet points for clarity

CONSTRAINTS:
- Do not make claims without data
- Avoid overly technical jargon
- Focus on measurable outcomes
```

### LLM Configuration

- **Temperature 0.0-0.3**: Factual, precise (legal, technical)
- **Temperature 0.5-0.8**: Balanced (most use cases)
- **Temperature 0.9-2.0**: Creative, exploratory (brainstorming, marketing)

### Naming Conventions

- Use lowercase with hyphens: `data-scientist`, `legal-advisor`
- Be descriptive: `email-marketing-specialist` vs `marketing-agent`
- Avoid generic names: `agent1`, `custom-agent`

---

## Troubleshooting

### "Template already exists"

Template names must be unique. Either:
- Choose a different name
- Delete the existing template first (if custom)
- Update the existing template instead

### "Cannot modify/delete default templates"

Default templates (orchestrator, backend, frontend, qa, devops) are protected.
Create a custom template instead:

```bash
# Get the default template
curl http://localhost:8000/api/agent-templates/name/backend > backend_template.json

# Modify the JSON (change name!)
# Create as custom template
curl -X POST http://localhost:8000/api/agent-templates -d @backend_template.json
```

### "Agent with name already exists" (on instantiate)

Agent names must be unique. Use the `agent_name_override` query parameter:

```bash
curl -X POST "http://localhost:8000/api/agent-templates/{id}/instantiate?agent_name_override=marketing-strategist-v2"
```

---

## API Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/agent-templates` | Create new template |
| GET | `/api/agent-templates` | List all templates (with filters) |
| GET | `/api/agent-templates/{id}` | Get template by ID |
| GET | `/api/agent-templates/name/{name}` | Get template by name |
| PUT | `/api/agent-templates/{id}` | Update template (custom only) |
| DELETE | `/api/agent-templates/{id}` | Delete template (custom only) |
| POST | `/api/agent-templates/{id}/instantiate` | Create agent from template |
| GET | `/api/agent-templates/{id}/agents` | List agents from template |

---

## Next Steps

1. **Explore Examples**: Check `/backend/AGENT_TEMPLATES_IMPLEMENTATION.md` for detailed examples
2. **API Docs**: Visit http://localhost:8000/docs for interactive testing
3. **Frontend Integration**: See implementation guide for UI development
4. **Create Your First Template**: Start with a simple use case (e.g., email writer, code reviewer)

---

## Support

- **Documentation**: `/backend/AGENT_TEMPLATES_IMPLEMENTATION.md`
- **API Reference**: http://localhost:8000/docs
- **GitHub Issues**: https://github.com/yourusername/reznet-ai/issues
- **Main README**: `/README.md`

---

**Happy Agent Creating!** 🤖
