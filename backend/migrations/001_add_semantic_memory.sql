-- Migration: Add Semantic Memory Support with pgvector
-- Description: Adds proper pgvector support to agent_memories table
-- Date: 2025-01-30

-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Drop existing agent_memories table if it exists (backup first if needed!)
-- WARNING: This will delete all existing agent memories
-- If you have data you want to keep, backup the table first:
-- CREATE TABLE agent_memories_backup AS SELECT * FROM agent_memories;

DROP TABLE IF EXISTS agent_memories CASCADE;

-- Create agent_memories table with proper pgvector support
CREATE TABLE agent_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,

    -- Content
    content TEXT NOT NULL,
    embedding vector(768),  -- nomic-embed-text (Ollama): 768 dimensions, OpenAI small: 1536

    -- Memory classification
    memory_type VARCHAR(50) DEFAULT 'conversation' NOT NULL,
    importance INTEGER DEFAULT 5 NOT NULL CHECK (importance BETWEEN 1 AND 10),

    -- Metadata
    metadata JSONB DEFAULT '{}',

    -- Timestamps and access tracking
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    accessed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    access_count INTEGER DEFAULT 0 NOT NULL,

    -- Constraints
    CONSTRAINT agent_memories_agent_fkey FOREIGN KEY (agent_id)
        REFERENCES agents(id) ON DELETE CASCADE,
    CONSTRAINT agent_memories_channel_fkey FOREIGN KEY (channel_id)
        REFERENCES channels(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX idx_agent_memories_agent_id ON agent_memories(agent_id);
CREATE INDEX idx_agent_memories_channel_id ON agent_memories(channel_id);
CREATE INDEX idx_agent_memories_memory_type ON agent_memories(memory_type);
CREATE INDEX idx_agent_memories_importance ON agent_memories(importance);
CREATE INDEX idx_agent_memories_created_at ON agent_memories(created_at);
CREATE INDEX idx_agent_memories_accessed_at ON agent_memories(accessed_at);

-- Create vector index for semantic similarity search (HNSW index for fast approximate nearest neighbor)
-- This dramatically speeds up cosine similarity queries
CREATE INDEX idx_agent_memories_embedding ON agent_memories
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Add comment explaining the table
COMMENT ON TABLE agent_memories IS
'Stores agent long-term memories with semantic embeddings for RAG-based retrieval';

COMMENT ON COLUMN agent_memories.embedding IS
'768-dimensional vector embedding for semantic similarity search (nomic-embed-text)';

COMMENT ON COLUMN agent_memories.memory_type IS
'Type: conversation, decision, entity, summary, or tool_use';

COMMENT ON COLUMN agent_memories.importance IS
'Importance score 1-10, affects retrieval priority';

COMMENT ON COLUMN agent_memories.access_count IS
'Tracks how often memory is accessed, used for importance scoring';

-- Grant permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON agent_memories TO your_app_user;

-- Verify installation
SELECT
    'agent_memories table created successfully' as status,
    COUNT(*) as row_count
FROM agent_memories;

-- Test pgvector is working
SELECT 'pgvector extension is working' as test
WHERE EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'vector'
);

COMMIT;
