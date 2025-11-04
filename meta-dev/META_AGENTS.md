# Meta-Development Agent Team

> **Purpose**: Documentation for the 6 Claude Code agents that build RezNet AI
> **Last Updated**: 2025-10-29
> **Location**: `.claude/agents/`

---

## Overview

The meta-development team consists of 6 specialized Claude Code agents that coordinate to build RezNet AI according to the PRD and NFR specifications. These agents operate **externally** to the RezNet AI codebase (not within the product itself) using Claude Code's `/agent` command.

**CRITICAL DISTINCTION**: These are development tools for building RezNet AI (Meta-Development Mode), NOT the product's runtime agents (@orchestrator, @backend, etc. in User Mode).

---

## Team Roster

| Agent | Role | Primary Tools | Owned Documents |
|-------|------|--------------|-----------------|
| **Quorra** | Product Manager / Orchestrator | All tools | PRD.md, NFR.md, PRD-GITHUB-ISSUES-MAPPING.md |
| **Kevin-UI** | Frontend Developer | Read, Write, Edit, Bash | NFR.md (Usability) |
| **Sam-DB** | Backend Developer | Read, Write, Edit, Bash | NFR.md (Performance, Scalability) |
| **Tron-QA** | QA & Security Engineer | Read, Write, Edit, Bash | NFR.md (Testing), SECURITY.md |
| **Flynn-Dev** | DevOps Engineer | Read, Write, Edit, Bash | NFR.md (Infrastructure, Observability) |
| **Rinzler-PM** | Project Manager | Read, Bash, WebFetch | PRD-GITHUB-ISSUES-MAPPING.md |

---

## Agent Details

### Quorra (Product Manager / Orchestrator)

**File**: `.claude/agents/quorra.md`

**Identity**: Lead orchestrator for meta-development. Reads PRD/NFR, coordinates workflows, delegates to specialists.

**Responsibilities**:
- Read and interpret `meta-dev/PRD.md` and `meta-dev/NFR.md`
- Break down Phase 2 features into actionable tasks
- Delegate to specialist agents (Kevin-UI, Sam-DB, Tron-QA, Flynn-Dev, Rinzler-PM)
- Map user requests to PRD roadmap and GitHub Issues
- Make high-level architecture decisions per `CLAUDE.md`

**When to Invoke**:
```bash
# Orchestrate a feature from PRD
/agent quorra "Implement custom agent creation per PRD Phase 2 Feature #1"

# Get status on roadmap
/agent quorra "What's the status of Phase 2 features?"

# Plan a complex workflow
/agent quorra "Plan the implementation for enhanced error handling"
```

**Key Behaviors**:
- Reads PRD before starting any feature work
- References GitHub Issues via Rinzler-PM
- Checks NFR requirements for technical constraints
- Creates structured task breakdowns with agent assignments
- Uses TodoWrite to track multi-step workflows

---

### Kevin-UI (Frontend Developer)

**File**: `.claude/agents/kevin-ui.md`

**Identity**: Frontend specialist implementing Next.js/React UI components per NFR accessibility standards.

**Responsibilities**:
- Build Next.js 14 + React components in `frontend/`
- Ensure WCAG 2.1 Level AA compliance (NFR requirement)
- Use Tailwind CSS with cyberpunk theme
- TypeScript strict mode
- Responsive design (desktop-first Phase 2, mobile Phase 3)

**When to Invoke**:
```bash
# Create a component
/agent kevin-ui "Create AgentCreationModal component with form validation"

# Update UI
/agent kevin-ui "Add model selection dropdown to agent form"

# Fix accessibility
/agent kevin-ui "Ensure keyboard navigation works in agent list"
```

**Key Behaviors**:
- Writes components in `frontend/components/`
- Follows WCAG 2.1 AA accessibility standards
- Uses Tailwind with cyberpunk colors
- Validates with TypeScript strict mode
- Tests keyboard navigation manually
- Collaborates with Sam-DB on API contracts

**NFR Ownership**:
- Performance: Bundle size < 500KB gzipped (NFR line 45)
- Accessibility: WCAG 2.1 AA (NFR lines 122-128)
- Browser support: Chrome 100+, Firefox 100+, Safari 15+ (NFR lines 130-137)

---

### Sam-DB (Backend Developer)

**File**: `.claude/agents/sam-db.md`

**Identity**: Backend architect implementing FastAPI endpoints, database schemas, and server-side logic.

**Responsibilities**:
- Build FastAPI REST endpoints in `backend/routers/`
- Design PostgreSQL schemas in `backend/models/`
- Implement business logic (agent management, workflows)
- Meet NFR performance targets (< 3s response, 100+ concurrent users)
- WebSocket events, MCP integration

**When to Invoke**:
```bash
# Create API endpoint
/agent sam-db "Create POST /api/agents endpoint per GitHub Issue #18"

# Update database schema
/agent sam-db "Add is_custom column to agents table"

# Implement business logic
/agent sam-db "Implement agent validation logic with prompt sanitization"
```

**Key Behaviors**:
- Writes async FastAPI code in `backend/`
- Uses Pydantic for validation
- Implements retry logic with exponential backoff
- User-friendly error messages (no stack traces)
- Database transactions for multi-step ops
- Collaborates with Kevin-UI on API contracts

**NFR Ownership**:
- Performance: < 3s response time, < 200ms API latency (NFR lines 19-29)
- Scalability: 1000+ custom agents per user (NFR line 99)
- Reliability: Retry logic, graceful degradation (NFR lines 62-67)
- Data Integrity: Zero data loss, transactions (NFR lines 69-75)

---

### Tron-QA (Quality Assurance & Security)

**File**: `.claude/agents/tron-qa.md`

**Identity**: QA and security specialist ensuring code quality and compliance.

**Responsibilities**:
- Achieve 80%+ code coverage (NFR requirement)
- Validate security compliance (SECURITY.md)
- Validate acceptance criteria (GitHub Issues)
- Test edge cases and failure scenarios
- Accessibility testing (WCAG 2.1 AA)

**When to Invoke**:
```bash
# Write tests
/agent tron-qa "Write integration tests for custom agent creation flow"

# Security validation
/agent tron-qa "Test for prompt injection vulnerabilities in agent creation"

# Accessibility check
/agent tron-qa "Verify AgentCreationModal is WCAG 2.1 AA compliant"
```

**Key Behaviors**:
- Writes pytest tests in `backend/tests/`
- Writes Jest tests in `frontend/__tests__/`
- Writes Playwright E2E tests in `tests/e2e/`
- Validates against SECURITY.md policies
- Tracks coverage (pytest-cov)
- Reports quality metrics to Rinzler-PM

**NFR Ownership**:
- Testing: 80% backend, 70% frontend coverage (NFR lines 203-206)
- Security: Prompt injection, XSS, SQL injection prevention (SECURITY.md)
- Quality: Defect tracking, bug density targets (NFR lines 284-289)

---

### Flynn-Dev (DevOps Engineer)

**File**: `.claude/agents/flynn-dev.md`

**Identity**: Infrastructure architect managing Docker, CI/CD, deployment, and observability.

**Responsibilities**:
- Manage Docker and docker-compose
- Maintain CI/CD pipelines (GitHub Actions)
- Setup/deployment scripts
- Logging, monitoring, metrics, alerting
- Database backups, migrations, connection pooling

**When to Invoke**:
```bash
# Update CI/CD
/agent flynn-dev "Update CI pipeline to run agent creation tests"

# Infrastructure changes
/agent flynn-dev "Add health checks to docker-compose services"

# Monitoring
/agent flynn-dev "Implement structured JSON logging for agent operations"
```

**Key Behaviors**:
- Updates `docker-compose.yml`, `.github/workflows/`
- Writes automation scripts in `scripts/`
- Implements health checks and observability
- Manages database connection pooling
- Ensures zero data loss (backups, transactions)
- Collaborates with Sam-DB on performance

**NFR Ownership**:
- Infrastructure: Stateless workers, connection pooling (NFR lines 105-109)
- Observability: Structured logs, metrics, alerts (NFR lines 156-196)
- Reliability: 99.9% uptime SLA, backups (NFR lines 54-75)

---

### Rinzler-PM (Project Manager)

**File**: `.claude/agents/rinzler-pm.md`

**Identity**: Project coordinator managing GitHub Issues, PRs, milestones, and tracking progress.

**Responsibilities**:
- Create, update, label, assign, close GitHub Issues
- Create PRs, request reviews, manage merges
- Manage milestones and project boards
- Keep GitHub Issues aligned with PRD roadmap
- Report blockers, status, upcoming work

**When to Invoke**:
```bash
# Create issue
/agent rinzler-pm "Create GitHub Issue for Enhanced Error Handling per PRD"

# Update status
/agent rinzler-pm "Update Issue #18 - backend complete, frontend in progress"

# Create PR
/agent rinzler-pm "Create PR for custom agent creation feature"

# Progress report
/agent rinzler-pm "Generate Phase 2 progress report"
```

**Key Behaviors**:
- Uses `gh` CLI for all GitHub operations
- Reads `meta-dev/PRD-GITHUB-ISSUES-MAPPING.md`
- Updates issue status when agents complete work
- Ensures acceptance criteria met before closing
- Coordinates with Quorra on priorities
- Reports progress to team

**Document Ownership**:
- `meta-dev/PRD-GITHUB-ISSUES-MAPPING.md` (keeps updated)
- GitHub Issues, PRs, milestones

---

## Responsibility Matrix

| Area | Owner | Collaborators |
|------|-------|---------------|
| **Product Vision & Roadmap** | Quorra | Rinzler-PM |
| **Frontend UI** | Kevin-UI | Sam-DB (API), Tron-QA (testing) |
| **Backend API & Logic** | Sam-DB | Kevin-UI (API), Tron-QA (testing) |
| **Testing & QA** | Tron-QA | All (provide testable code) |
| **Security & Compliance** | Tron-QA | Sam-DB (backend), Kevin-UI (frontend) |
| **Infrastructure & CI/CD** | Flynn-Dev | Sam-DB (DB), Tron-QA (test env) |
| **GitHub Issues & PRs** | Rinzler-PM | All (update status) |
| **Documentation** | Flynn-Dev | All (document own work) |

---

## Document References

Each agent references these documents during their work:

### Primary References

**All Agents Read**:
- `CLAUDE.md` - Technical architecture, design patterns, system overview
- `README.md` - Quick start, installation, usage

**Quorra Reads**:
- `meta-dev/PRD.md` - Product vision, roadmap, Phase 2 priorities
- `meta-dev/NFR.md` - Non-functional requirements (all sections)
- `meta-dev/PRD-GITHUB-ISSUES-MAPPING.md` - PRD ↔ GitHub Issue mapping
- `SECURITY.md` - Security policies

**Kevin-UI Reads**:
- `meta-dev/NFR.md` (lines 122-144) - Accessibility, browser support, responsive design
- `CLAUDE.md` - Frontend architecture, component patterns

**Sam-DB Reads**:
- `meta-dev/NFR.md` (lines 19-116) - Performance, reliability, scalability, data integrity
- `CLAUDE.md` - Backend architecture, database schema, agent system

**Tron-QA Reads**:
- `meta-dev/NFR.md` (lines 199-236) - Testing requirements, coverage targets
- `meta-dev/TESTING_SETUP.md` - Testing infrastructure setup (dependencies to install)
- `SECURITY.md` - Security validation checklist
- GitHub Issues - Acceptance criteria

**Flynn-Dev Reads**:
- `meta-dev/NFR.md` (lines 105-109, 156-196) - Infrastructure, observability
- `docker-compose.yml` - Service configuration
- `.github/workflows/` - CI/CD pipelines

**Rinzler-PM Reads**:
- `meta-dev/PRD-GITHUB-ISSUES-MAPPING.md` - Feature ↔ Issue mapping
- GitHub Issues - All issue details

---

## Typical Workflows

### Workflow 1: Implement a Phase 2 Feature

**User Request**: "Implement custom agent creation"

**Execution**:
```bash
# Step 1: Quorra orchestrates
/agent quorra "Implement custom agent creation per PRD Phase 2 Feature #1"

# Quorra reads PRD, creates task breakdown, then delegates:

# Step 2: Sam-DB builds backend
/agent sam-db "Create POST /api/agents endpoint per GitHub Issue #18"

# Step 3: Kevin-UI builds frontend
/agent kevin-ui "Create AgentCreationModal component with form validation"

# Step 4: Tron-QA writes tests
/agent tron-qa "Write integration tests for custom agent creation flow"

# Step 5: Flynn-Dev updates docs/CI
/agent flynn-dev "Update API documentation and CI pipeline"

# Step 6: Rinzler-PM manages GitHub
/agent rinzler-pm "Update Issue #18 status and create PR"
```

### Workflow 2: Fix a Bug

**User Request**: "Agent creation returns 500 error for duplicate names"

**Execution**:
```bash
# Step 1: Rinzler-PM creates issue
/agent rinzler-pm "Create bug issue for agent creation duplicate name handling"

# Step 2: Sam-DB fixes backend
/agent sam-db "Fix agent creation to return 409 Conflict for duplicate names"

# Step 3: Tron-QA validates
/agent tron-qa "Write test for duplicate agent name handling, verify 409 response"

# Step 4: Rinzler-PM closes issue
/agent rinzler-pm "Close bug issue #X after verification"
```

### Workflow 3: Progress Check

**User Request**: "What's the status of Phase 2?"

**Execution**:
```bash
# Step 1: Quorra checks status
/agent quorra "What's the status of Phase 2 features?"

# Quorra delegates to Rinzler-PM:
/agent rinzler-pm "Generate Phase 2 progress report with issue statuses"

# Rinzler-PM uses gh CLI to fetch data, generates report
```

---

## Usage Tips

### Best Practices

1. **Start with Quorra** for complex features - let the orchestrator plan and delegate
2. **Use specialists directly** for targeted work - e.g., "/agent sam-db" for a specific API endpoint
3. **Keep Rinzler-PM updated** - agents should report completion to trigger GitHub updates
4. **Reference documents** - agents will read PRD/NFR automatically, no need to copy/paste
5. **Be specific** - include file paths, issue numbers, and requirements in requests

### Common Patterns

**Feature Implementation**:
```bash
/agent quorra "Implement [feature] per PRD Phase [N] Feature #[X]"
# Quorra orchestrates → delegates to specialists → tracks progress
```

**Bug Fix**:
```bash
/agent rinzler-pm "Create bug issue for [problem]"
/agent [specialist] "Fix [problem] per Issue #[X]"
/agent tron-qa "Test fix for Issue #[X]"
/agent rinzler-pm "Close Issue #[X]"
```

**Status Check**:
```bash
/agent quorra "Status of [feature/phase]"
# or
/agent rinzler-pm "Generate progress report for Phase [N]"
```

**Direct Specialist Work**:
```bash
/agent kevin-ui "Create [component] in frontend/components/"
/agent sam-db "Add [endpoint] to backend/routers/"
/agent flynn-dev "Update [docker-compose/CI pipeline]"
```

---

## Distinction from Product Agents

**Meta-Development Agents** (Claude Code) vs **Product Agents** (RezNet AI runtime):

| Aspect | Meta-Dev Agents | Product Agents |
|--------|-----------------|----------------|
| **Purpose** | Build RezNet AI | Help users with tasks |
| **Location** | `.claude/agents/` (external) | `backend/agents/` (internal) |
| **Invocation** | `/agent quorra` | `@orchestrator` |
| **Context** | Meta-Development Mode | User Mode |
| **Documents** | Read PRD/NFR/CLAUDE | Read user requirements |
| **Names** | Tron-themed (Quorra, Kevin-UI) | Role-based (@backend, @frontend) |
| **Lifecycle** | Development tools | Runtime services |

**Example**:
- **Meta-Dev**: `/agent sam-db "Create POST /api/agents endpoint"` (building the product)
- **Product**: `@backend How do I implement JWT authentication?` (using the product)

---

## File Structure

```
.claude/
└── agents/
    ├── quorra.md       # Product Manager / Orchestrator
    ├── kevin-ui.md     # Frontend Developer
    ├── sam-db.md       # Backend Developer
    ├── tron-qa.md      # QA & Security Engineer
    ├── flynn-dev.md    # DevOps Engineer
    └── rinzler-pm.md   # Project Manager

meta-dev/
├── PRD.md                        # Product Requirements (Quorra reads)
├── NFR.md                        # Non-Functional Requirements (all read)
├── PRD-GITHUB-ISSUES-MAPPING.md  # Issue mapping (Rinzler-PM reads)
└── META_AGENTS.md                # This file (team documentation)
```

---

## Next Steps

1. **Test Each Agent**: Invoke each agent with a simple task to verify setup
2. **Implement First Feature**: Use Quorra to orchestrate custom agent creation (Issue #18)
3. **Establish Workflow**: Get comfortable with orchestration → delegation → tracking pattern
4. **Monitor Progress**: Use Rinzler-PM for regular status updates
5. **Iterate**: Refine agent prompts based on real-world usage

---

*Last updated: 2025-10-29*
*Maintained by: Meta-Development Team*
