"""
Database connection and session management
"""

from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.engine import Engine
from core.config import settings
import time
import logging
from contextvars import ContextVar

logger = logging.getLogger(__name__)

# Context variable to track query metrics per request
query_profiling_context: ContextVar[dict] = ContextVar("query_profiling", default=None)

# Create database engine with optimized connection pool
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,  # Increased from 5 for better concurrency
    max_overflow=20,  # Increased from 10 for high-load scenarios
    pool_recycle=3600,  # Recycle connections after 1 hour
    echo=settings.DEBUG
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()


# SQLAlchemy Event Listeners for Query Profiling
@event.listens_for(Engine, "before_cursor_execute")
def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    """Track query start time"""
    conn.info.setdefault("query_start_time", []).append(time.time())


@event.listens_for(Engine, "after_cursor_execute")
def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    """
    Track query execution time and log slow queries.

    NFR Target: < 100ms per query (95th percentile)
    """
    total_time = time.time() - conn.info["query_start_time"].pop()
    duration_ms = total_time * 1000

    # Get profiling context from request state
    profiling = query_profiling_context.get()

    if profiling is not None:
        profiling["query_count"] += 1
        profiling["query_time"] += duration_ms

        # Track slow queries (> 100ms threshold per NFR)
        if duration_ms > 100:
            profiling["slow_queries"].append({
                "duration": duration_ms,
                "statement": statement
            })

    # Log extremely slow queries (> 500ms) regardless of context
    if duration_ms > 500:
        logger.error(
            f"VERY SLOW QUERY ({duration_ms:.2f}ms): {statement[:300]}"
        )
    elif duration_ms > 100:
        logger.warning(
            f"Slow query ({duration_ms:.2f}ms): {statement[:200]}"
        )


# Dependency for FastAPI routes with profiling
def get_db():
    """
    Get database session with query profiling.

    Tracks query count and execution time per request.
    """
    db = SessionLocal()
    try:
        # Initialize profiling context for this request
        profiling = {
            "query_count": 0,
            "query_time": 0.0,
            "slow_queries": []
        }
        query_profiling_context.set(profiling)

        yield db

        # After request completes, profiling data is available in context
        # The middleware will read this and add to request.state
    finally:
        db.close()
        query_profiling_context.set(None)
