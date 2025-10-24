-- RezNet AI Database Schema
-- Local MVP - Single User

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";

-- Single workspace for local user
CREATE TABLE workspace (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) DEFAULT 'Local Workspace',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pre-configured agents
CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    agent_type VARCHAR(50) NOT NULL,
    persona JSONB NOT NULL,
    config JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Channels for organization
CREATE TABLE channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    topic TEXT,
    is_archived BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Message history
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
    author_id UUID,
    author_type VARCHAR(10) NOT NULL CHECK (author_type IN ('user', 'agent')),
    author_name VARCHAR(100),
    content TEXT NOT NULL,
    thread_id UUID REFERENCES messages(id),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Task tracking
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    description TEXT NOT NULL,
    assigned_to UUID REFERENCES agents(id),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    context JSONB DEFAULT '{}',
    result JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- Agent memory for RAG
CREATE TABLE agent_memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    content TEXT,
    embedding vector(1536),
    memory_type VARCHAR(50) DEFAULT 'conversation',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_messages_channel ON messages(channel_id, created_at DESC);
CREATE INDEX idx_messages_thread ON messages(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX idx_messages_author ON messages(author_id, author_type);
CREATE INDEX idx_tasks_status ON tasks(status, created_at DESC);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_agent_memories_agent ON agent_memories(agent_id);
CREATE INDEX idx_agent_memories_embedding ON agent_memories USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Trigger to update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_workspace_updated_at BEFORE UPDATE ON workspace
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_channels_updated_at BEFORE UPDATE ON channels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Initial data for local setup
INSERT INTO workspace (name, settings) VALUES
    ('Local Development', '{"theme": "dark", "ai_model": "claude-3-5-sonnet-20241022"}');

INSERT INTO channels (name, topic) VALUES
    ('general', 'General discussion and casual chat'),
    ('development', 'Software development tasks and collaboration'),
    ('testing', 'Testing, QA, and bug reports'),
    ('devops', 'Infrastructure, deployment, and operations');

INSERT INTO agents (name, agent_type, persona, config) VALUES
    (
        '@orchestrator',
        'orchestrator',
        '{
            "role": "Team Lead & Project Orchestrator",
            "goal": "Coordinate development tasks across the team and ensure project success",
            "backstory": "You are an experienced technical lead with 10+ years managing software teams. You excel at breaking down complex projects into actionable tasks, delegating to specialists, and ensuring quality delivery.",
            "capabilities": ["task_planning", "team_coordination", "architecture_decisions", "code_review"]
        }',
        '{
            "model": "claude-3-5-sonnet-20241022",
            "temperature": 0.7,
            "max_tokens": 4000
        }'
    ),
    (
        '@backend',
        'backend',
        '{
            "role": "Senior Backend Engineer",
            "goal": "Build robust, scalable backend systems and APIs",
            "backstory": "You are a Python/FastAPI expert with deep knowledge of databases, API design, and system architecture. You write clean, performant, well-tested code.",
            "capabilities": ["api_development", "database_design", "performance_optimization", "security"]
        }',
        '{
            "model": "claude-3-5-sonnet-20241022",
            "temperature": 0.3,
            "max_tokens": 4000
        }'
    ),
    (
        '@frontend',
        'frontend',
        '{
            "role": "Senior Frontend Developer",
            "goal": "Create beautiful, responsive, accessible user interfaces",
            "backstory": "You are a React/Next.js specialist who crafts pixel-perfect UIs with excellent UX. You know TypeScript, Tailwind CSS, and modern frontend best practices.",
            "capabilities": ["ui_development", "component_design", "state_management", "responsive_design"]
        }',
        '{
            "model": "claude-3-5-sonnet-20241022",
            "temperature": 0.4,
            "max_tokens": 4000
        }'
    ),
    (
        '@qa',
        'qa',
        '{
            "role": "QA Engineer & Testing Specialist",
            "goal": "Ensure code quality through comprehensive testing",
            "backstory": "You are a meticulous QA engineer who writes thorough test cases, finds edge cases, and ensures nothing breaks. You know pytest, Jest, and testing best practices.",
            "capabilities": ["test_writing", "bug_detection", "quality_assurance", "test_automation"]
        }',
        '{
            "model": "claude-3-5-sonnet-20241022",
            "temperature": 0.2,
            "max_tokens": 3000
        }'
    ),
    (
        '@devops',
        'devops',
        '{
            "role": "DevOps Engineer",
            "goal": "Manage infrastructure, deployment, and operational excellence",
            "backstory": "You are a DevOps expert skilled in Docker, CI/CD, monitoring, and cloud infrastructure. You ensure systems run smoothly and deployments are reliable.",
            "capabilities": ["infrastructure", "deployment", "monitoring", "optimization"]
        }',
        '{
            "model": "claude-3-5-sonnet-20241022",
            "temperature": 0.3,
            "max_tokens": 3000
        }'
    );

-- Add welcome message to general channel
INSERT INTO messages (channel_id, author_type, author_name, content, metadata)
SELECT
    id,
    'agent',
    '@orchestrator',
    'Welcome to RezNet AI! 👋

I''m your orchestrator agent, ready to help coordinate your development tasks. Here''s how to work with our team:

**Available Agents:**
- `@orchestrator` - That''s me! I coordinate tasks and delegate to specialists
- `@backend` - Backend development (Python, FastAPI, databases)
- `@frontend` - Frontend development (React, Next.js, TypeScript)
- `@qa` - Testing and quality assurance
- `@devops` - Infrastructure and deployment

**How to use:**
1. Mention agents directly: "@backend create a REST API for user management"
2. Let me orchestrate: "Build a todo app with authentication"
3. Ask questions: "@frontend how should I structure my components?"

Let''s build something amazing together! What would you like to work on?',
    '{"is_welcome": true, "tokens_used": 0}'
FROM channels WHERE name = 'general';
