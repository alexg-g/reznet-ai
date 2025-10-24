/**
 * RezNet AI - Filesystem MCP Server
 * Provides file system access for AI agents
 */

import express from 'express';
import cors from 'cors';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.MCP_FILESYSTEM_PORT || 3001;
const WORKSPACE_ROOT = process.env.MCP_FILESYSTEM_WORKSPACE || path.join(__dirname, '../../data/workspaces');

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

/**
 * Validate and resolve file path within workspace
 */
function validatePath(relativePath) {
    const fullPath = path.join(WORKSPACE_ROOT, relativePath || '');
    const normalized = path.normalize(fullPath);

    // Ensure path is within workspace
    if (!normalized.startsWith(path.normalize(WORKSPACE_ROOT))) {
        throw new Error('Access denied: Path outside workspace');
    }

    return normalized;
}

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'MCP Filesystem Server',
        workspace: WORKSPACE_ROOT,
        port: PORT
    });
});

/**
 * List available tools
 */
app.get('/tools', (req, res) => {
    res.json({
        tools: [
            {
                name: 'read_file',
                description: 'Read contents of a file',
                parameters: {
                    path: { type: 'string', required: true, description: 'Path to file relative to workspace' }
                }
            },
            {
                name: 'write_file',
                description: 'Write content to a file',
                parameters: {
                    path: { type: 'string', required: true, description: 'Path to file relative to workspace' },
                    content: { type: 'string', required: true, description: 'Content to write' }
                }
            },
            {
                name: 'list_directory',
                description: 'List contents of a directory',
                parameters: {
                    path: { type: 'string', required: false, description: 'Path to directory (default: root)' }
                }
            },
            {
                name: 'create_directory',
                description: 'Create a new directory',
                parameters: {
                    path: { type: 'string', required: true, description: 'Path to directory to create' }
                }
            },
            {
                name: 'delete_file',
                description: 'Delete a file',
                parameters: {
                    path: { type: 'string', required: true, description: 'Path to file to delete' }
                }
            },
            {
                name: 'file_exists',
                description: 'Check if a file or directory exists',
                parameters: {
                    path: { type: 'string', required: true, description: 'Path to check' }
                }
            }
        ]
    });
});

/**
 * Read file
 */
app.post('/tools/read_file', async (req, res) => {
    try {
        const { path: filePath } = req.body;
        if (!filePath) {
            return res.status(400).json({ error: 'Path parameter required' });
        }

        const fullPath = validatePath(filePath);
        const content = await fs.readFile(fullPath, 'utf-8');

        res.json({
            success: true,
            path: filePath,
            content,
            size: content.length
        });
    } catch (error) {
        console.error('Error reading file:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Write file
 */
app.post('/tools/write_file', async (req, res) => {
    try {
        const { path: filePath, content } = req.body;
        if (!filePath || content === undefined) {
            return res.status(400).json({ error: 'Path and content parameters required' });
        }

        const fullPath = validatePath(filePath);

        // Ensure directory exists
        const dirPath = path.dirname(fullPath);
        await fs.mkdir(dirPath, { recursive: true });

        await fs.writeFile(fullPath, content, 'utf-8');

        res.json({
            success: true,
            path: filePath,
            size: content.length
        });
    } catch (error) {
        console.error('Error writing file:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * List directory
 */
app.post('/tools/list_directory', async (req, res) => {
    try {
        const { path: dirPath = '' } = req.body;
        const fullPath = validatePath(dirPath);

        const entries = await fs.readdir(fullPath, { withFileTypes: true });
        const files = [];

        for (const entry of entries) {
            const stats = await fs.stat(path.join(fullPath, entry.name));
            files.push({
                name: entry.name,
                type: entry.isDirectory() ? 'directory' : 'file',
                size: stats.size,
                modified: stats.mtime.toISOString()
            });
        }

        res.json({
            success: true,
            path: dirPath || '/',
            files
        });
    } catch (error) {
        console.error('Error listing directory:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Create directory
 */
app.post('/tools/create_directory', async (req, res) => {
    try {
        const { path: dirPath } = req.body;
        if (!dirPath) {
            return res.status(400).json({ error: 'Path parameter required' });
        }

        const fullPath = validatePath(dirPath);
        await fs.mkdir(fullPath, { recursive: true });

        res.json({
            success: true,
            path: dirPath
        });
    } catch (error) {
        console.error('Error creating directory:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Delete file
 */
app.post('/tools/delete_file', async (req, res) => {
    try {
        const { path: filePath } = req.body;
        if (!filePath) {
            return res.status(400).json({ error: 'Path parameter required' });
        }

        const fullPath = validatePath(filePath);
        await fs.unlink(fullPath);

        res.json({
            success: true,
            path: filePath
        });
    } catch (error) {
        console.error('Error deleting file:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Check if file exists
 */
app.post('/tools/file_exists', async (req, res) => {
    try {
        const { path: filePath } = req.body;
        if (!filePath) {
            return res.status(400).json({ error: 'Path parameter required' });
        }

        const fullPath = validatePath(filePath);

        try {
            await fs.access(fullPath);
            const stats = await fs.stat(fullPath);
            res.json({
                success: true,
                exists: true,
                path: filePath,
                type: stats.isDirectory() ? 'directory' : 'file'
            });
        } catch {
            res.json({
                success: true,
                exists: false,
                path: filePath
            });
        }
    } catch (error) {
        console.error('Error checking file:', error);
        res.status(500).json({ error: error.message });
    }
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Ensure workspace directory exists
(async () => {
    try {
        await fs.mkdir(WORKSPACE_ROOT, { recursive: true });
        console.log(`✅ Workspace directory ready: ${WORKSPACE_ROOT}`);
    } catch (error) {
        console.error('Failed to create workspace directory:', error);
        process.exit(1);
    }
})();

// Start server
app.listen(PORT, () => {
    console.log(`🚀 MCP Filesystem Server running on port ${PORT}`);
    console.log(`📁 Workspace: ${WORKSPACE_ROOT}`);
});
