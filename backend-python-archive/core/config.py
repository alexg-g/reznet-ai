"""
Configuration management using Pydantic Settings
"""

from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings"""

    # Database
    DATABASE_URL: str
    REDIS_URL: str

    # Authentication
    AUTH_ENABLED: bool = False
    LOCAL_USER_ID: str = "local-dev-user"
    LOCAL_USER_NAME: str = "Developer"

    # LLM Providers
    ANTHROPIC_API_KEY: Optional[str] = None
    ANTHROPIC_DEFAULT_MODEL: str = "claude-3-5-sonnet-20241022"

    OPENAI_API_KEY: Optional[str] = None
    OPENAI_DEFAULT_MODEL: str = "gpt-4-turbo-preview"

    OLLAMA_HOST: str = "http://localhost:11434"
    OLLAMA_DEFAULT_MODEL: str = "llama2"
    OLLAMA_EMBEDDING_MODEL: str = "nomic-embed-text"
    USE_OLLAMA: bool = False

    DEFAULT_LLM_PROVIDER: str = "anthropic"
    DEFAULT_EMBEDDING_PROVIDER: str = "ollama"

    # MCP Servers
    MCP_FILESYSTEM_ENABLED: bool = True
    MCP_FILESYSTEM_PORT: int = 3001
    MCP_FILESYSTEM_WORKSPACE: str

    MCP_GITHUB_ENABLED: bool = True
    MCP_GITHUB_PORT: int = 3002
    MCP_GITHUB_TOKEN: Optional[str] = None

    MCP_DATABASE_ENABLED: bool = False
    MCP_DATABASE_PORT: int = 3003

    # Backend API
    BACKEND_HOST: str = "0.0.0.0"
    BACKEND_PORT: int = 8000
    BACKEND_WORKERS: int = 1
    CORS_ORIGINS: str = "http://localhost:3000"

    # Storage
    LOCAL_STORAGE_PATH: str = "./data"
    UPLOAD_PATH: str = "./data/uploads"
    WORKSPACE_PATH: str = "./data/workspaces"
    AGENT_MEMORY_PATH: str = "./data/agent-memory"

    # Development
    DEBUG: bool = True
    LOG_LEVEL: str = "info"
    HOT_RELOAD: bool = True
    ENABLE_LOCAL_METRICS: bool = True
    METRICS_PORT: int = 9090

    # AI Configuration
    MAX_TOKENS_PER_RESPONSE: int = 4000
    DEFAULT_TEMPERATURE: float = 0.7
    ENABLE_CACHE: bool = True
    CACHE_TTL: int = 3600
    USE_EMBEDDINGS_CACHE: bool = True
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    EMBEDDING_DIMENSIONS: int = 768  # nomic-embed-text: 768, OpenAI small: 1536

    # Agent Configuration
    MAX_CONCURRENT_AGENTS: int = 5
    TASK_TIMEOUT: int = 300
    ENABLE_AGENT_MEMORY: bool = True

    # Security
    SECRET_KEY: str = "local-dev-secret-key-change-in-production"
    ALLOWED_HOSTS: str = "localhost,127.0.0.1"

    # Feature Flags
    ENABLE_VOICE_INPUT: bool = False
    ENABLE_CODE_EXECUTION: bool = False
    ENABLE_WEB_SEARCH: bool = False

    class Config:
        env_file = "../.env"
        case_sensitive = True
        extra = "ignore"


# Global settings instance
settings = Settings()
