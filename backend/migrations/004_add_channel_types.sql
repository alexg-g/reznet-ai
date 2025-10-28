-- Migration 004: Add channel types and agent relationship
-- Purpose: Enable robust DM channel detection and support custom agents
-- Date: 2025-10-28

-- Add channel_type column (public, dm, private)
ALTER TABLE channels
ADD COLUMN IF NOT EXISTS channel_type VARCHAR(20) DEFAULT 'public' NOT NULL;

-- Add dm_agent_id foreign key for DM channels
ALTER TABLE channels
ADD COLUMN IF NOT EXISTS dm_agent_id UUID;

-- Add foreign key constraint
ALTER TABLE channels
ADD CONSTRAINT fk_channels_dm_agent
FOREIGN KEY (dm_agent_id) REFERENCES agents(id) ON DELETE CASCADE;

-- Backfill existing DM channels
-- This updates all channels with names starting with 'dm-@' to have:
-- 1. channel_type = 'dm'
-- 2. dm_agent_id pointing to the corresponding agent
UPDATE channels
SET
    channel_type = 'dm',
    dm_agent_id = (
        SELECT id FROM agents
        WHERE channels.name = 'dm-' || agents.name
    )
WHERE name LIKE 'dm-@%';

-- Add CHECK constraint for valid channel types
ALTER TABLE channels
ADD CONSTRAINT channels_type_check
CHECK (channel_type IN ('public', 'dm', 'private'));

-- Add constraint: DM channels must have dm_agent_id
ALTER TABLE channels
ADD CONSTRAINT channels_dm_agent_check
CHECK (
    (channel_type = 'dm' AND dm_agent_id IS NOT NULL) OR
    (channel_type != 'dm')
);

-- Add index for efficient DM channel lookups
CREATE INDEX IF NOT EXISTS idx_channels_dm_agent
ON channels(dm_agent_id)
WHERE channel_type = 'dm';

-- Add index for channel type filtering
CREATE INDEX IF NOT EXISTS idx_channels_type
ON channels(channel_type);

-- Add column comments for documentation
COMMENT ON COLUMN channels.channel_type IS 'Type of channel: public (default), dm (direct message with agent), or private (future use)';
COMMENT ON COLUMN channels.dm_agent_id IS 'Agent ID for DM channels. Required when channel_type=dm. NULL for other channel types.';

-- Verify migration success
DO $$
DECLARE
    dm_count INTEGER;
    backfilled_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO dm_count FROM channels WHERE name LIKE 'dm-@%';
    SELECT COUNT(*) INTO backfilled_count FROM channels WHERE channel_type = 'dm' AND dm_agent_id IS NOT NULL;

    RAISE NOTICE 'Migration 004 completed successfully';
    RAISE NOTICE 'Found % DM channels by name pattern', dm_count;
    RAISE NOTICE 'Backfilled % DM channels with agent links', backfilled_count;

    IF dm_count != backfilled_count THEN
        RAISE WARNING 'Some DM channels could not be backfilled. Check agent names match channel names.';
    END IF;
END $$;
