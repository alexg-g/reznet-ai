-- Database Performance Optimization Migration
-- Issue #47: Add indexes for query optimization
-- NFR Target: Database query time < 100ms (95th percentile)

-- Agent table indexes
CREATE INDEX IF NOT EXISTS idx_agents_name ON agents(name);
CREATE INDEX IF NOT EXISTS idx_agents_type ON agents(agent_type);
CREATE INDEX IF NOT EXISTS idx_agents_active ON agents(is_active);
CREATE INDEX IF NOT EXISTS idx_agents_type_active ON agents(agent_type, is_active);

-- Message table indexes
CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_author_id ON messages(author_id);
CREATE INDEX IF NOT EXISTS idx_messages_channel_created ON messages(channel_id, created_at);

-- Workflow table indexes
CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);
CREATE INDEX IF NOT EXISTS idx_workflows_created_at ON workflows(created_at);
CREATE INDEX IF NOT EXISTS idx_workflows_channel_id ON workflows(channel_id);
CREATE INDEX IF NOT EXISTS idx_workflows_status_created ON workflows(status, created_at);

-- WorkflowTask table indexes
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_workflow_id ON workflow_tasks(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_status ON workflow_tasks(status);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_order ON workflow_tasks(order_index);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_workflow_status ON workflow_tasks(workflow_id, status);

-- Analyze tables for query planner optimization
ANALYZE agents;
ANALYZE messages;
ANALYZE workflows;
ANALYZE workflow_tasks;
