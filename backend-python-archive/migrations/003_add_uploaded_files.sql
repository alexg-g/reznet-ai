-- Migration: Add uploaded_files table for file upload feature
-- Created: 2025-10-26
-- Issue: #5

CREATE TABLE IF NOT EXISTS uploaded_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    original_filename VARCHAR(255) NOT NULL,
    stored_filename VARCHAR(255) NOT NULL,  -- UUID + extension for safe storage
    workspace_path TEXT NOT NULL,            -- Relative path in workspace: "uploads/YYYY-MM-DD/uuid.ext"
    file_size BIGINT NOT NULL,               -- Size in bytes
    mime_type VARCHAR(100),                  -- MIME type (e.g., "text/plain", "application/json")
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,  -- Optional: link to message if attached
    uploaded_by VARCHAR(100) DEFAULT 'local-user',  -- User identifier (for future multi-user)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_uploaded_files_message_id ON uploaded_files(message_id);
CREATE INDEX idx_uploaded_files_created_at ON uploaded_files(created_at);
CREATE INDEX idx_uploaded_files_workspace_path ON uploaded_files(workspace_path);

-- Comments for documentation
COMMENT ON TABLE uploaded_files IS 'Stores metadata for user-uploaded files in the workspace';
COMMENT ON COLUMN uploaded_files.workspace_path IS 'Path relative to workspace root where MCP filesystem can access the file';
COMMENT ON COLUMN uploaded_files.stored_filename IS 'Unique filename with UUID to prevent collisions';
COMMENT ON COLUMN uploaded_files.message_id IS 'Optional reference to message if file was attached to a message';
