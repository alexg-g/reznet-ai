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

from routers import channels, agents, tasks
from websocket.manager import socket_app
from core.database import engine, Base
from core.config import settings

# Load environment variables
load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    # Startup
    print("🚀 Starting RezNet AI...")
    print(f"📊 Database: {settings.DATABASE_URL[:50]}...")
    print(f"🤖 Default LLM: {settings.DEFAULT_LLM_PROVIDER}")
    print(f"🔧 Debug mode: {settings.DEBUG}")

    yield

    # Shutdown
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
app.include_router(tasks.router, prefix="/api", tags=["tasks"])


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
