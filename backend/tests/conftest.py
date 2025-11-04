"""
Pytest configuration and fixtures for RezNet AI tests

Provides common test fixtures for:
- Database sessions
- HTTP clients
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
from httpx import AsyncClient
import time
import logging

from core.database import Base, get_db
from core.cache import CacheManager
from core.config import settings
from main import app

logger = logging.getLogger(__name__)


# Test database URL (use in-memory or test database)
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def event_loop() -> Generator:
    """Create an event loop for the test session"""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="function")
async def db_engine():
    """Create a test database engine"""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        echo=False,
        future=True
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest.fixture(scope="function")
async def db_session(db_engine) -> AsyncGenerator[AsyncSession, None]:
    """Create a test database session"""
    async_session_maker = async_sessionmaker(
        db_engine,
        class_=AsyncSession,
        expire_on_commit=False
    )

    async with async_session_maker() as session:
        yield session


@pytest.fixture(scope="function")
async def client(db_session) -> AsyncGenerator[AsyncClient, None]:
    """Create a test HTTP client"""

    # Override database dependency
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


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


# Performance test markers
def pytest_configure(config):
    """Register custom markers"""
    config.addinivalue_line(
        "markers", "performance: mark test as a performance test"
    )
    config.addinivalue_line(
        "markers", "load: mark test as a load test"
    )
    config.addinivalue_line(
        "markers", "slow: mark test as slow running"
    )
