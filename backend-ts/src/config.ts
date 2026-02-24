/**
 * Configuration management using Zod schema validation.
 *
 * Mirrors the Python Pydantic Settings in backend/core/config.py.
 * Loads from ../.env (project root), same path as the Python backend.
 */

import { z } from "zod";
import { config as loadDotenv } from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

// ---------------------------------------------------------------------------
// Load .env from project root (../.env relative to backend-ts/)
// Equivalent to: env_file = "../.env" in Python Pydantic Settings
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

loadDotenv({ path: resolve(__dirname, "../../.env") });

// ---------------------------------------------------------------------------
// Helper: coerce comma-separated string values and boolean-like strings
// ---------------------------------------------------------------------------

/** Parses "true"/"1"/"yes" -> true, anything else -> false */
const booleanString = z
  .string()
  .transform((val) => ["true", "1", "yes"].includes(val.toLowerCase()))
  .or(z.boolean());

/** Parses a string of comma-separated values into a string array */
const commaSeparatedString = z
  .string()
  .transform((val) => val.split(",").map((s) => s.trim()).filter(Boolean));

// ---------------------------------------------------------------------------
// Full settings schema
// ---------------------------------------------------------------------------

const SettingsSchema = z.object({
  // -------------------------------------------------------------------------
  // Database
  // -------------------------------------------------------------------------
  DATABASE_URL: z.string({
    required_error: "DATABASE_URL is required. Set it in .env.",
  }),
  REDIS_URL: z.string({
    required_error: "REDIS_URL is required. Set it in .env.",
  }),

  // -------------------------------------------------------------------------
  // Authentication
  // -------------------------------------------------------------------------
  AUTH_ENABLED: booleanString.default("false"),
  LOCAL_USER_ID: z.string().default("local-dev-user"),
  LOCAL_USER_NAME: z.string().default("Developer"),

  // -------------------------------------------------------------------------
  // LLM Providers
  // -------------------------------------------------------------------------

  // Anthropic
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_DEFAULT_MODEL: z.string().default("claude-sonnet-4-20250514"),

  // OpenAI
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_DEFAULT_MODEL: z.string().default("gpt-4o"),

  // Google Gemini (new — added in .env.example update)
  GOOGLE_API_KEY: z.string().optional(),
  GOOGLE_DEFAULT_MODEL: z.string().default("gemini-2.0-flash"),

  // Groq (new — added in .env.example update)
  GROQ_API_KEY: z.string().optional(),
  GROQ_DEFAULT_MODEL: z.string().default("llama-3.3-70b-versatile"),

  // Ollama (local models)
  OLLAMA_HOST: z.string().url().default("http://localhost:11434"),
  OLLAMA_DEFAULT_MODEL: z.string().default("llama3.1"),
  OLLAMA_EMBEDDING_MODEL: z.string().default("nomic-embed-text"),
  USE_OLLAMA: booleanString.default("false"),

  // Provider selection
  DEFAULT_LLM_PROVIDER: z.string().default("anthropic"),
  DEFAULT_EMBEDDING_PROVIDER: z.string().default("ollama"),

  // -------------------------------------------------------------------------
  // MCP Servers
  // -------------------------------------------------------------------------

  // Filesystem MCP server
  MCP_FILESYSTEM_ENABLED: booleanString.default("true"),
  MCP_FILESYSTEM_PORT: z.coerce.number().int().positive().default(3001),
  MCP_FILESYSTEM_WORKSPACE: z.string({
    required_error: "MCP_FILESYSTEM_WORKSPACE is required. Set it in .env.",
  }),

  // GitHub MCP server
  MCP_GITHUB_ENABLED: booleanString.default("true"),
  MCP_GITHUB_PORT: z.coerce.number().int().positive().default(3002),
  MCP_GITHUB_TOKEN: z.string().optional(),

  // Database MCP server (planned)
  MCP_DATABASE_ENABLED: booleanString.default("false"),
  MCP_DATABASE_PORT: z.coerce.number().int().positive().default(3003),

  // -------------------------------------------------------------------------
  // Backend API
  // -------------------------------------------------------------------------
  BACKEND_HOST: z.string().default("0.0.0.0"),
  BACKEND_PORT: z.coerce.number().int().positive().default(8000),
  BACKEND_WORKERS: z.coerce.number().int().positive().default(1),
  CORS_ORIGINS: commaSeparatedString.default("http://localhost:3000"),

  // -------------------------------------------------------------------------
  // Storage
  // -------------------------------------------------------------------------
  LOCAL_STORAGE_PATH: z.string().default("./data"),
  UPLOAD_PATH: z.string().default("./data/uploads"),
  WORKSPACE_PATH: z.string().default("./data/workspaces"),
  AGENT_MEMORY_PATH: z.string().default("./data/agent-memory"),

  // -------------------------------------------------------------------------
  // Development
  // -------------------------------------------------------------------------
  DEBUG: booleanString.default("true"),
  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error", "fatal", "silent"])
    .default("info"),
  HOT_RELOAD: booleanString.default("true"),
  ENABLE_LOCAL_METRICS: booleanString.default("true"),
  METRICS_PORT: z.coerce.number().int().positive().default(9090),

  // -------------------------------------------------------------------------
  // AI Configuration
  // -------------------------------------------------------------------------
  MAX_TOKENS_PER_RESPONSE: z.coerce.number().int().positive().default(4000),
  DEFAULT_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.7),
  ENABLE_CACHE: booleanString.default("true"),
  CACHE_TTL: z.coerce.number().int().positive().default(3600),
  USE_EMBEDDINGS_CACHE: booleanString.default("true"),
  EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(768),

  // -------------------------------------------------------------------------
  // Agent Configuration
  // -------------------------------------------------------------------------
  MAX_CONCURRENT_AGENTS: z.coerce.number().int().positive().default(5),
  TASK_TIMEOUT: z.coerce.number().int().positive().default(300),
  ENABLE_AGENT_MEMORY: booleanString.default("true"),

  // -------------------------------------------------------------------------
  // Security
  // -------------------------------------------------------------------------
  SECRET_KEY: z
    .string()
    .default("local-dev-secret-key-change-in-production"),
  ALLOWED_HOSTS: commaSeparatedString.default("localhost,127.0.0.1"),

  // -------------------------------------------------------------------------
  // Feature Flags
  // -------------------------------------------------------------------------
  ENABLE_VOICE_INPUT: booleanString.default("false"),
  ENABLE_CODE_EXECUTION: booleanString.default("false"),
  ENABLE_WEB_SEARCH: booleanString.default("false"),
});

// ---------------------------------------------------------------------------
// Inferred TypeScript type (mirrors what Pydantic would generate)
// ---------------------------------------------------------------------------

export type Settings = z.infer<typeof SettingsSchema>;

// ---------------------------------------------------------------------------
// Parse and validate — fail fast at startup with a clear error message
// ---------------------------------------------------------------------------

function loadSettings(): Settings {
  const result = SettingsSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  • ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `[config] Invalid or missing environment variables:\n${issues}\n` +
        `Ensure your .env file exists at the project root and contains all required values.`
    );
  }

  return result.data;
}

// ---------------------------------------------------------------------------
// Exported singleton — imported by all other modules
// ---------------------------------------------------------------------------

export const settings: Settings = loadSettings();
