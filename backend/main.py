"""
RezNet AI - Main FastAPI Application
Local MVP Version
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import os
from dotenv import load_dotenv
from contextlib import asynccontextmanager

from routers import channels, agents, tasks, workflows, workspace, uploads, agent_templates
from websocket import manager as websocket_manager  # Import full module to register event handlers
from websocket.manager import socket_app
from core.database import engine, Base
from core.config import settings

# Load environment variables
load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    # Startup
    import datetime
    startup_time = datetime.datetime.now().isoformat()
    print("🚀 Starting RezNet AI...")
    print(f"⏰ Startup Time: {startup_time}")
    print(f"📊 Database: {settings.DATABASE_URL[:50]}...")

    # LLM Provider Information
    print(f"\n🤖 LLM Provider: {settings.DEFAULT_LLM_PROVIDER}")

    if settings.DEFAULT_LLM_PROVIDER == "anthropic":
        print(f"   └─ Model: {settings.ANTHROPIC_DEFAULT_MODEL}")
    elif settings.DEFAULT_LLM_PROVIDER == "openai":
        print(f"   └─ Model: {settings.OPENAI_DEFAULT_MODEL}")
    elif settings.DEFAULT_LLM_PROVIDER == "ollama":
        print(f"   └─ Model: {settings.OLLAMA_DEFAULT_MODEL}")
        print(f"   └─ Host: {settings.OLLAMA_HOST}")

    # Show all configured providers
    print(f"\n🔧 Available Providers:")
    if settings.ANTHROPIC_API_KEY:
        indicator = "✓" if settings.DEFAULT_LLM_PROVIDER == "anthropic" else " "
        print(f"   [{indicator}] Anthropic (Claude) - {settings.ANTHROPIC_DEFAULT_MODEL}")
    if settings.OPENAI_API_KEY:
        indicator = "✓" if settings.DEFAULT_LLM_PROVIDER == "openai" else " "
        print(f"   [{indicator}] OpenAI (GPT) - {settings.OPENAI_DEFAULT_MODEL}")
    if settings.USE_OLLAMA:
        indicator = "✓" if settings.DEFAULT_LLM_PROVIDER == "ollama" else " "
        print(f"   [{indicator}] Ollama (Local) - {settings.OLLAMA_DEFAULT_MODEL}")

    print(f"\n🔧 Debug mode: {settings.DEBUG}")

    # Initialize database (agents, channels, DM channels)
    from core.database import SessionLocal
    from utils import initialize_database
    db = SessionLocal()
    try:
        initialize_database(db)
    finally:
        db.close()

    # Clear agent cache to ensure fresh instances with valid HTTP clients
    # This is critical for hot-reload scenarios where httpx.AsyncClient
    # connections become stale
    from agents.processor import clear_agent_cache
    clear_agent_cache()
    print("🔄 Agent cache cleared (agents will use current LLM provider)")

    yield

    # Shutdown
    from agents.processor import cleanup_agent_cache
    await cleanup_agent_cache()
    print("👋 Shutting down RezNet AI...")


# Initialize FastAPI app
app = FastAPI(
    title="RezNet AI API",
    description="AI Agent Collaboration Platform - Local MVP",
    version="1.0.0-local",
    lifespan=lifespan
)

# CORS middleware for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Socket.IO app for WebSocket support
app.mount("/socket.io", socket_app)

# Include routers
app.include_router(channels.router, prefix="/api", tags=["channels"])
app.include_router(agents.router, prefix="/api", tags=["agents"])
app.include_router(agent_templates.router, prefix="/api", tags=["agent-templates"])
app.include_router(tasks.router, prefix="/api", tags=["tasks"])
app.include_router(workflows.router, prefix="/api", tags=["workflows"])
app.include_router(workspace.router, tags=["workspace"])
app.include_router(uploads.router, tags=["uploads"])


# Health check endpoint
@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "RezNet AI",
        "version": "1.0.0-local",
        "environment": "local-development"
    }


# System stats endpoint
@app.get("/api/stats")
async def get_stats():
    """Get system statistics"""
    from core.database import SessionLocal
    from models.database import Agent, Message, Task

    db = SessionLocal()
    try:
        total_agents = db.query(Agent).count()
        active_agents = db.query(Agent).filter(Agent.is_active == True).count()
        total_messages = db.query(Message).count()
        total_tasks = db.query(Task).count()
        pending_tasks = db.query(Task).filter(Task.status == 'pending').count()

        return {
            "agents": {
                "total": total_agents,
                "active": active_agents
            },
            "messages": {
                "total": total_messages
            },
            "tasks": {
                "total": total_tasks,
                "pending": pending_tasks
            }
        }
    finally:
        db.close()


# Reset endpoint (dev only)
@app.post("/api/reset")
async def reset_database():
    """Reset the local database (development only)"""
    if not settings.DEBUG:
        return JSONResponse(
            status_code=403,
            content={"error": "Reset only available in debug mode"}
        )

    # This would drop and recreate all tables
    # For safety, we'll just return a message
    return {
        "message": "Database reset not implemented. Use ./scripts/reset.sh instead",
        "hint": "Run: docker-compose down -v && docker-compose up -d"
    }


# LLM Configuration endpoint
@app.get("/api/llm-config")
async def get_llm_config():
    """
    Get current LLM provider configuration
    Returns information about configured providers and which one is active
    """
    return {
        "current_provider": settings.DEFAULT_LLM_PROVIDER,
        "providers": {
            "anthropic": {
                "available": bool(settings.ANTHROPIC_API_KEY),
                "default_model": settings.ANTHROPIC_DEFAULT_MODEL,
                "configured": bool(settings.ANTHROPIC_API_KEY)
            },
            "openai": {
                "available": bool(settings.OPENAI_API_KEY),
                "default_model": settings.OPENAI_DEFAULT_MODEL,
                "configured": bool(settings.OPENAI_API_KEY)
            },
            "ollama": {
                "available": settings.USE_OLLAMA,
                "default_model": settings.OLLAMA_DEFAULT_MODEL,
                "host": settings.OLLAMA_HOST,
                "configured": settings.USE_OLLAMA
            }
        },
        "note": "All agents will use the current_provider unless they have a per-agent override in their config"
    }


# Diagnostic endpoint for Ollama (dev only)
@app.get("/api/diagnostic/ollama")
async def diagnostic_ollama():
    """Test Ollama connectivity from FastAPI context (development only)"""
    if not settings.DEBUG:
        return JSONResponse(
            status_code=403,
            content={"error": "Diagnostic endpoints only available in debug mode"}
        )

    import httpx
    import logging
    logger = logging.getLogger(__name__)

    results = {}

    # Test 1: Direct httpx call with full URL
    try:
        logger.info("DIAGNOSTIC TEST 1: Direct POST with full URL")
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{settings.OLLAMA_HOST}/api/generate",
                json={"model": settings.OLLAMA_DEFAULT_MODEL, "prompt": "Hello", "stream": False},
                timeout=30.0
            )
            results["test1_direct_full_url"] = {
                "status": response.status_code,
                "success": response.status_code == 200,
                "url": str(response.url),
                "response_preview": response.text[:200] if response.status_code == 200 else response.text
            }
    except Exception as e:
        results["test1_direct_full_url"] = {
            "error": str(e),
            "type": type(e).__name__
        }

    # Test 2: httpx with base_url (like LLMClient)
    try:
        logger.info("DIAGNOSTIC TEST 2: Using base_url pattern")
        async with httpx.AsyncClient(base_url=settings.OLLAMA_HOST, timeout=httpx.Timeout(30.0)) as client:
            response = await client.post(
                "/api/generate",
                json={"model": settings.OLLAMA_DEFAULT_MODEL, "prompt": "Hello", "stream": False}
            )
            results["test2_base_url"] = {
                "status": response.status_code,
                "success": response.status_code == 200,
                "url": str(response.url),
                "base_url": settings.OLLAMA_HOST,
                "response_preview": response.text[:200] if response.status_code == 200 else response.text
            }
    except Exception as e:
        results["test2_base_url"] = {
            "error": str(e),
            "type": type(e).__name__
        }

    # Test 3: build_request + send (exact LLMClient pattern)
    try:
        logger.info("DIAGNOSTIC TEST 3: build_request + send pattern")
        client = httpx.AsyncClient(base_url=settings.OLLAMA_HOST, timeout=httpx.Timeout(30.0))
        request = client.build_request(
            "POST",
            "/api/generate",
            json={"model": settings.OLLAMA_DEFAULT_MODEL, "prompt": "Hello", "stream": False}
        )
        logger.info(f"DIAGNOSTIC: Built request URL: {request.url}")
        response = await client.send(request)
        await client.aclose()

        results["test3_build_send"] = {
            "status": response.status_code,
            "success": response.status_code == 200,
            "url": str(response.url),
            "method": request.method,
            "headers": dict(request.headers),
            "response_preview": response.text[:200] if response.status_code == 200 else response.text
        }
    except Exception as e:
        results["test3_build_send"] = {
            "error": str(e),
            "type": type(e).__name__
        }
        if 'client' in locals():
            try:
                await client.aclose()
            except:
                pass

    # Test 4: Test through LLMClient directly
    try:
        logger.info("DIAGNOSTIC TEST 4: Through LLMClient")
        from agents.llm_client import LLMClient
        llm = LLMClient(provider="ollama", model=settings.OLLAMA_DEFAULT_MODEL)
        response = await llm.generate(prompt="Hello, this is a test", system="You are a helpful assistant")
        results["test4_llm_client"] = {
            "success": True,
            "response_length": len(response),
            "response_preview": response[:200]
        }
    except Exception as e:
        results["test4_llm_client"] = {
            "error": str(e),
            "type": type(e).__name__
        }

    return {
        "ollama_config": {
            "host": settings.OLLAMA_HOST,
            "model": settings.OLLAMA_DEFAULT_MODEL,
            "use_ollama": settings.USE_OLLAMA,
            "default_provider": settings.DEFAULT_LLM_PROVIDER
        },
        "tests": results
    }


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "RezNet AI",
        "version": "1.0.0-local",
        "status": "running",
        "docs": "/docs",
        "health": "/api/health"
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.BACKEND_HOST,
        port=settings.BACKEND_PORT,
        reload=settings.HOT_RELOAD,
        log_level=settings.LOG_LEVEL.lower()
    )
