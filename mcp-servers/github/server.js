/**
 * RezNet AI - GitHub MCP Server
 * Provides GitHub integration for AI agents
 */

import express from 'express';
import cors from 'cors';
import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

const app = express();
const PORT = process.env.MCP_GITHUB_PORT || 3002;
const GITHUB_TOKEN = process.env.MCP_GITHUB_TOKEN;

// Initialize Octokit if token is available
let octokit = null;
if (GITHUB_TOKEN) {
    octokit = new Octokit({ auth: GITHUB_TOKEN });
    console.log('✅ GitHub token configured');
} else {
    console.warn('⚠️  No GitHub token found. Some features will be limited.');
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'MCP GitHub Server',
        authenticated: !!octokit,
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
                name: 'get_repository',
                description: 'Get repository information',
                parameters: {
                    owner: { type: 'string', required: true },
                    repo: { type: 'string', required: true }
                }
            },
            {
                name: 'list_files',
                description: 'List files in a repository',
                parameters: {
                    owner: { type: 'string', required: true },
                    repo: { type: 'string', required: true },
                    path: { type: 'string', required: false, default: '' }
                }
            },
            {
                name: 'get_file_content',
                description: 'Get content of a file from repository',
                parameters: {
                    owner: { type: 'string', required: true },
                    repo: { type: 'string', required: true },
                    path: { type: 'string', required: true }
                }
            },
            {
                name: 'create_issue',
                description: 'Create an issue in a repository',
                parameters: {
                    owner: { type: 'string', required: true },
                    repo: { type: 'string', required: true },
                    title: { type: 'string', required: true },
                    body: { type: 'string', required: false }
                }
            },
            {
                name: 'list_pull_requests',
                description: 'List pull requests in a repository',
                parameters: {
                    owner: { type: 'string', required: true },
                    repo: { type: 'string', required: true },
                    state: { type: 'string', required: false, default: 'open' }
                }
            }
        ]
    });
});

/**
 * Middleware to check authentication
 */
function requireAuth(req, res, next) {
    if (!octokit) {
        return res.status(401).json({
            error: 'GitHub token not configured',
            message: 'Set MCP_GITHUB_TOKEN environment variable'
        });
    }
    next();
}

/**
 * Get repository information
 */
app.post('/tools/get_repository', requireAuth, async (req, res) => {
    try {
        const { owner, repo } = req.body;
        if (!owner || !repo) {
            return res.status(400).json({ error: 'Owner and repo parameters required' });
        }

        const response = await octokit.repos.get({ owner, repo });

        res.json({
            success: true,
            repository: {
                name: response.data.name,
                full_name: response.data.full_name,
                description: response.data.description,
                url: response.data.html_url,
                stars: response.data.stargazers_count,
                forks: response.data.forks_count,
                language: response.data.language,
                created_at: response.data.created_at,
                updated_at: response.data.updated_at
            }
        });
    } catch (error) {
        console.error('Error getting repository:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * List files in repository
 */
app.post('/tools/list_files', requireAuth, async (req, res) => {
    try {
        const { owner, repo, path = '' } = req.body;
        if (!owner || !repo) {
            return res.status(400).json({ error: 'Owner and repo parameters required' });
        }

        const response = await octokit.repos.getContent({
            owner,
            repo,
            path
        });

        const files = Array.isArray(response.data) ? response.data : [response.data];

        res.json({
            success: true,
            path,
            files: files.map(file => ({
                name: file.name,
                path: file.path,
                type: file.type,
                size: file.size,
                url: file.html_url
            }))
        });
    } catch (error) {
        console.error('Error listing files:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get file content
 */
app.post('/tools/get_file_content', requireAuth, async (req, res) => {
    try {
        const { owner, repo, path } = req.body;
        if (!owner || !repo || !path) {
            return res.status(400).json({ error: 'Owner, repo, and path parameters required' });
        }

        const response = await octokit.repos.getContent({
            owner,
            repo,
            path
        });

        if (response.data.type !== 'file') {
            return res.status(400).json({ error: 'Path is not a file' });
        }

        const content = Buffer.from(response.data.content, 'base64').toString('utf-8');

        res.json({
            success: true,
            path,
            content,
            size: response.data.size,
            encoding: response.data.encoding
        });
    } catch (error) {
        console.error('Error getting file content:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Create issue
 */
app.post('/tools/create_issue', requireAuth, async (req, res) => {
    try {
        const { owner, repo, title, body = '' } = req.body;
        if (!owner || !repo || !title) {
            return res.status(400).json({ error: 'Owner, repo, and title parameters required' });
        }

        const response = await octokit.issues.create({
            owner,
            repo,
            title,
            body
        });

        res.json({
            success: true,
            issue: {
                number: response.data.number,
                title: response.data.title,
                url: response.data.html_url,
                state: response.data.state
            }
        });
    } catch (error) {
        console.error('Error creating issue:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * List pull requests
 */
app.post('/tools/list_pull_requests', requireAuth, async (req, res) => {
    try {
        const { owner, repo, state = 'open' } = req.body;
        if (!owner || !repo) {
            return res.status(400).json({ error: 'Owner and repo parameters required' });
        }

        const response = await octokit.pulls.list({
            owner,
            repo,
            state
        });

        res.json({
            success: true,
            pull_requests: response.data.map(pr => ({
                number: pr.number,
                title: pr.title,
                state: pr.state,
                url: pr.html_url,
                created_at: pr.created_at,
                updated_at: pr.updated_at,
                author: pr.user.login
            }))
        });
    } catch (error) {
        console.error('Error listing pull requests:', error);
        res.status(500).json({ error: error.message });
    }
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 MCP GitHub Server running on port ${PORT}`);
    if (octokit) {
        console.log('✅ GitHub API authenticated');
    } else {
        console.log('⚠️  Running without GitHub authentication');
    }
});
