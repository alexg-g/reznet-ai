-- Migration: Add context_cleared_at column to channels table
-- Purpose: Support /clear command to reset channel context for agents
-- Date: 2025-10-25

-- Add context_cleared_at column
ALTER TABLE channels
ADD COLUMN IF NOT EXISTS context_cleared_at TIMESTAMP WITH TIME ZONE;

-- Add comment explaining the column
COMMENT ON COLUMN channels.context_cleared_at IS 'Timestamp when channel context was last cleared. Messages before this timestamp are hidden from agents.';
