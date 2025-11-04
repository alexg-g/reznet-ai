"""
Pytest configuration and fixtures for RezNet AI tests

Provides:
- Async test client
- Test database session
- Database setup/teardown
- Mock authentication
- Cache manager
- Mock agents
- Performance tracking
"""

import pytest
import asyncio
from typing import AsyncGenerator, Generator
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import NullPool
from httpx import AsyncClient
import time
import logging
import os

# Set test environment
os.environ["ENVIRONMENT"] = "test"
os.environ["DATABASE_URL"] = "postgresql+asyncpg://postgres:postgres@localhost/reznet_test"

# Add backend directory to Python path for imports
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.database import Base, get_db
from core.cache import CacheManager
from core.config import settings
from main import app
from models.database import Agent, Channel, AgentTemplate

logger = logging.getLogger(__name__)


# Test database URL
TEST_DATABASE_URL = "postgresql+asyncpg://postgres:postgres@localhost/reznet_test"


@pytest.fixture(scope="session")
def event_loop() -> Generator:
    """Create event loop for async tests."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="function")
async def test_engine():
    """Create test database engine."""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        poolclass=NullPool,  # Disable connection pooling for tests
        echo=False,
    )

    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    # Drop all tables after test
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest.fixture(scope="function")
async def db(test_engine) -> AsyncGenerator[AsyncSession, None]:
    """Create database session for tests."""
    async_session_maker = async_sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with async_session_maker() as session:
        yield session
        await session.rollback()


@pytest.fixture(scope="function")
async def client(db: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Create async test client."""
    # Override the get_db dependency
    async def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac

    # Clear overrides
    app.dependency_overrides.clear()


@pytest.fixture
def mock_user():
    """Mock authenticated user for tests."""
    return {
        "id": 1,
        "email": "test@example.com",
        "username": "testuser",
        "is_active": True,
    }


@pytest.fixture
def auth_headers(mock_user):
    """Mock authentication headers."""
    # In production, this would contain a real JWT token
    # For now, we'll use a simple header that our test auth can recognize
    return {
        "Authorization": f"Bearer test-token-{mock_user['id']}",
        "X-User-Id": str(mock_user["id"]),
    }


@pytest.fixture(scope="function")
def cache_manager():
    """Create a cache manager instance for testing"""
    cache = CacheManager()
    cache.reset_metrics()
    yield cache
    cache.flush_all()


@pytest.fixture(scope="function")
def performance_tracker():
    """
    Track performance metrics during tests

    Usage:
        def test_something(performance_tracker):
            with performance_tracker.measure("operation_name"):
                # do something

            assert performance_tracker.get_duration("operation_name") < 1000  # ms
    """
    class PerformanceTracker:
        def __init__(self):
            self.measurements = {}
            self.current_operation = None
            self.start_time = None

        def measure(self, operation: str):
            """Context manager for measuring operation duration"""
            class MeasureContext:
                def __init__(self, tracker, op):
                    self.tracker = tracker
                    self.operation = op

                def __enter__(self):
                    self.tracker.start_time = time.perf_counter()
                    self.tracker.current_operation = self.operation
                    return self

                def __exit__(self, exc_type, exc_val, exc_tb):
                    duration = (time.perf_counter() - self.tracker.start_time) * 1000
                    self.tracker.measurements[self.operation] = duration
                    self.tracker.current_operation = None
                    self.tracker.start_time = None

            return MeasureContext(self, operation)

        def get_duration(self, operation: str) -> float:
            """Get duration in milliseconds"""
            return self.measurements.get(operation, 0.0)

        def get_all_measurements(self) -> dict:
            """Get all measurements"""
            return self.measurements.copy()

        def assert_duration(self, operation: str, max_ms: float):
            """Assert operation completed within max_ms"""
            duration = self.get_duration(operation)
            assert duration <= max_ms, f"{operation} took {duration:.2f}ms (max: {max_ms}ms)"

    return PerformanceTracker()


@pytest.fixture(scope="function")
def mock_agent_data():
    """Mock agent data for testing"""
    return {
        "id": "00000000-0000-0000-0000-000000000001",
        "name": "@test-agent",
        "agent_type": "custom",
        "persona": {
            "role": "Test Agent",
            "goal": "Testing functionality",
            "backstory": "A test agent for automated testing"
        },
        "config": {
            "provider": "anthropic",
            "model": "claude-3-5-sonnet-20241022",
            "temperature": 0.7,
            "max_tokens": 1000
        },
        "is_active": True,
        "is_busy": False
    }


@pytest.fixture(scope="function")
def mock_message_data():
    """Mock message data for testing"""
    return {
        "channel_id": "00000000-0000-0000-0000-000000000001",
        "author_type": "user",
        "author_name": "Test User",
        "content": "Test message content"
    }


@pytest.fixture
async def seed_default_data(db: AsyncSession):
    """Seed database with default data for tests."""
    # Create default agents
    default_agents = [
        Agent(
            name="orchestrator",
            display_name="Orchestrator",
            role="Team Lead & Workflow Coordinator",
            is_custom=False,
            is_active=True,
            config={"model": "claude-3-opus-20240229"},
        ),
        Agent(
            name="backend",
            display_name="Backend Dev",
            role="Python & FastAPI Specialist",
            is_custom=False,
            is_active=True,
            config={"model": "claude-3-opus-20240229"},
        ),
        Agent(
            name="frontend",
            display_name="Frontend Dev",
            role="React & TypeScript Expert",
            is_custom=False,
            is_active=True,
            config={"model": "claude-3-opus-20240229"},
        ),
        Agent(
            name="qa",
            display_name="QA Engineer",
            role="Testing & Quality Specialist",
            is_custom=False,
            is_active=True,
            config={"model": "claude-3-opus-20240229"},
        ),
        Agent(
            name="devops",
            display_name="DevOps",
            role="Infrastructure & Deployment Expert",
            is_custom=False,
            is_active=True,
            config={"model": "claude-3-opus-20240229"},
        ),
    ]

    for agent in default_agents:
        db.add(agent)

    # Create default channel
    general_channel = Channel(
        name="general",
        description="General discussion",
        is_active=True,
    )
    db.add(general_channel)

    # Create default template categories
    default_templates = [
        AgentTemplate(
            name="Marketing Team",
            description="Complete marketing team setup",
            category="marketing",
            is_public=True,
            config={
                "agents": [
                    {"name": "strategist", "role": "Marketing Strategist"},
                    {"name": "copywriter", "role": "Content Writer"},
                    {"name": "seo", "role": "SEO Specialist"},
                ]
            },
            tags=["marketing", "team", "complete"],
            icon="📢",
        ),
        AgentTemplate(
            name="Development Team",
            description="Full-stack development team",
            category="development",
            is_public=True,
            config={
                "agents": [
                    {"name": "architect", "role": "System Architect"},
                    {"name": "backend", "role": "Backend Developer"},
                    {"name": "frontend", "role": "Frontend Developer"},
                    {"name": "qa", "role": "QA Engineer"},
                ]
            },
            tags=["development", "team", "fullstack"],
            icon="💻",
        ),
    ]

    for template in default_templates:
        db.add(template)

    await db.commit()

    return {
        "agents": default_agents,
        "channel": general_channel,
        "templates": default_templates,
    }


# Pytest configuration
pytest_plugins = ["pytest_asyncio"]


def pytest_configure(config):
    """Configure pytest with custom markers."""
    config.addinivalue_line(
        "markers",
        "slow: marks tests as slow (deselect with '-m \"not slow\"')",
    )
    config.addinivalue_line(
        "markers",
        "integration: marks tests as integration tests",
    )
    config.addinivalue_line(
        "markers",
        "unit: marks tests as unit tests",
    )
    config.addinivalue_line(
        "markers", "performance: mark test as a performance test"
    )
    config.addinivalue_line(
        "markers", "load: mark test as a load test"
    )
