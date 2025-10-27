-- Migration: Add agent task queue fields
-- Purpose: Enable 1-task-at-a-time concurrency control for agents
-- Date: 2025-10-25

-- Add current_task_id to track which task the agent is working on
ALTER TABLE agents
ADD COLUMN IF NOT EXISTS current_task_id UUID;

-- Add is_busy flag to quickly check agent availability
ALTER TABLE agents
ADD COLUMN IF NOT EXISTS is_busy BOOLEAN DEFAULT FALSE;

-- Add index on is_busy for fast availability queries
CREATE INDEX IF NOT EXISTS idx_agents_is_busy ON agents(is_busy) WHERE is_busy = TRUE;

-- Add comment explaining the columns
COMMENT ON COLUMN agents.current_task_id IS 'UUID of the current task the agent is working on (NULL if available)';
COMMENT ON COLUMN agents.is_busy IS 'Quick flag to check if agent is currently processing a task';

-- Add foreign key constraint (optional, but good practice)
-- Note: current_task_id could reference either workflow_tasks.id or messages.id
-- For now, we'll leave it as a simple UUID without foreign key to allow flexibility
