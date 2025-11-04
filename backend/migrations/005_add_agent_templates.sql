-- Migration: Add agent_templates table for custom agent creation
-- Issue: #18 - Custom Agent Creation
-- Date: 2025-10-29

-- Create agent_templates table
CREATE TABLE IF NOT EXISTS agent_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    role VARCHAR(200) NOT NULL,
    system_prompt TEXT NOT NULL,
    color VARCHAR(7),  -- hex color like #FF0000
    icon VARCHAR(10),  -- emoji or icon name
    available_tools JSONB DEFAULT '[]',  -- list of MCP server names
    llm_config JSONB DEFAULT '{}',  -- provider, model, temperature
    template_type VARCHAR(50) DEFAULT 'custom',  -- 'default', 'custom', 'community'
    domain VARCHAR(100),  -- e.g., 'software-dev', 'marketing', 'legal'
    is_public BOOLEAN DEFAULT false,
    created_by VARCHAR(100),  -- will be UUID FK to users table in Phase 3
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_agent_templates_domain ON agent_templates(domain);
CREATE INDEX IF NOT EXISTS idx_agent_templates_type ON agent_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_agent_templates_created_by ON agent_templates(created_by);

-- Add column to agents table to track template origin
ALTER TABLE agents ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES agent_templates(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_agents_template_id ON agents(template_id);

-- Insert default templates for the 5 specialist agents
INSERT INTO agent_templates (name, display_name, role, system_prompt, color, icon, template_type, domain, is_public)
VALUES
    (
        'orchestrator',
        'Orchestrator',
        'Project Manager & Task Coordinator',
        'You are the Orchestrator, the team lead responsible for coordinating AI agents and managing complex software development workflows.',
        '#9D00FF',
        '🎯',
        'default',
        'software-dev',
        true
    ),
    (
        'backend',
        'Backend Engineer',
        'Python/FastAPI Backend Developer',
        'You are a Backend Engineer specializing in Python, FastAPI, SQLAlchemy, and database design.',
        '#00F6FF',
        '⚙️',
        'default',
        'software-dev',
        true
    ),
    (
        'frontend',
        'Frontend Developer',
        'React/Next.js Frontend Developer',
        'You are a Frontend Developer specializing in React, Next.js, TypeScript, and modern UI/UX design.',
        '#FF00F7',
        '🎨',
        'default',
        'software-dev',
        true
    ),
    (
        'qa',
        'QA Specialist',
        'Testing & Quality Assurance Engineer',
        'You are a QA Specialist responsible for testing, quality assurance, and ensuring code reliability.',
        '#39FF14',
        '✅',
        'default',
        'software-dev',
        true
    ),
    (
        'devops',
        'DevOps Engineer',
        'Infrastructure & Deployment Specialist',
        'You are a DevOps Engineer specializing in Docker, CI/CD, deployment, and infrastructure management.',
        '#FF6B00',
        '🚀',
        'default',
        'software-dev',
        true
    )
ON CONFLICT (name) DO NOTHING;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_agent_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_agent_templates_updated_at
    BEFORE UPDATE ON agent_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_agent_templates_updated_at();

-- Comments for documentation
COMMENT ON TABLE agent_templates IS 'Templates for creating custom AI agents';
COMMENT ON COLUMN agent_templates.name IS 'Unique identifier for the template (alphanumeric, lowercase)';
COMMENT ON COLUMN agent_templates.display_name IS 'Human-readable display name';
COMMENT ON COLUMN agent_templates.system_prompt IS 'Base system prompt for agents created from this template';
COMMENT ON COLUMN agent_templates.available_tools IS 'JSON array of MCP server names this agent can use';
COMMENT ON COLUMN agent_templates.llm_config IS 'JSON object with provider, model, temperature, etc.';
COMMENT ON COLUMN agent_templates.template_type IS 'Type of template: default (built-in), custom (user-created), community (shared)';
COMMENT ON COLUMN agent_templates.domain IS 'Domain category: software-dev, marketing, legal, research, etc.';
