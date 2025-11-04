"""
Pytest configuration and fixtures for backend tests.

Provides:
- Async test client
- Test database session
- Database setup/teardown
- Mock authentication
"""

import asyncio
import pytest
from typing import AsyncGenerator, Generator
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool
import os

# Set test environment
os.environ["ENVIRONMENT"] = "test"
os.environ["DATABASE_URL"] = "postgresql+asyncpg://postgres:postgres@localhost/reznet_test"

# Add backend directory to Python path for imports
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app
from models.database import Base
from core.config import settings


# Override database URL for tests
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

    from backend.core.database import get_db
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


@pytest.fixture
async def seed_default_data(db: AsyncSession):
    """Seed database with default data for tests."""
    from backend.models.database import Agent, Channel, AgentTemplate

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