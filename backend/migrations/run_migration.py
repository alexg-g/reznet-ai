"""
Database Migration Runner for Semantic Memory

Usage:
    python migrations/run_migration.py

This script applies the semantic memory migration to your database.
"""

import sys
import os
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from core.database import engine
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def run_migration():
    """Run the semantic memory migration"""

    migration_file = Path(__file__).parent / "001_add_semantic_memory.sql"

    logger.info("=" * 60)
    logger.info("Semantic Memory Migration")
    logger.info("=" * 60)
    logger.info("")
    logger.info("This migration will:")
    logger.info("  1. Enable pgvector extension")
    logger.info("  2. Create agent_memories table with vector support")
    logger.info("  3. Create indexes for fast semantic search")
    logger.info("")
    logger.warning("⚠️  WARNING: This will DROP the existing agent_memories table!")
    logger.warning("   If you have data to preserve, backup first.")
    logger.info("")

    response = input("Continue with migration? (yes/no): ")
    if response.lower() not in ['yes', 'y']:
        logger.info("Migration cancelled.")
        return

    logger.info("")
    logger.info("Reading migration file...")

    # Read migration SQL
    with open(migration_file, 'r') as f:
        migration_sql = f.read()

    # Split into individual statements (rough split on semicolon)
    statements = [
        stmt.strip()
        for stmt in migration_sql.split(';')
        if stmt.strip() and not stmt.strip().startswith('--')
    ]

    logger.info(f"Found {len(statements)} SQL statements")
    logger.info("")
    logger.info("Executing migration...")

    try:
        with engine.begin() as conn:
            for i, statement in enumerate(statements, 1):
                if statement.strip():
                    logger.info(f"  [{i}/{len(statements)}] Executing statement...")
                    logger.debug(f"    SQL: {statement[:100]}...")

                    try:
                        conn.execute(text(statement))
                    except Exception as e:
                        # Some statements might fail gracefully (like CREATE EXTENSION IF NOT EXISTS)
                        if "already exists" in str(e).lower():
                            logger.debug(f"    ℹ️  Already exists: {e}")
                        else:
                            raise

            logger.info("")
            logger.info("✅ Migration completed successfully!")
            logger.info("")

            # Verify
            result = conn.execute(text("SELECT COUNT(*) FROM agent_memories"))
            count = result.scalar()
            logger.info(f"✓ agent_memories table created (current rows: {count})")

            # Check pgvector
            result = conn.execute(text(
                "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector')"
            ))
            has_pgvector = result.scalar()

            if has_pgvector:
                logger.info("✓ pgvector extension is enabled")
            else:
                logger.error("✗ pgvector extension not found")
                raise Exception("pgvector extension failed to install")

            logger.info("")
            logger.info("=" * 60)
            logger.info("Migration Summary")
            logger.info("=" * 60)
            logger.info("✅ Semantic memory support is now active!")
            logger.info("")
            logger.info("Next steps:")
            logger.info("  1. Update agents to use BaseAgentWithMemory")
            logger.info("  2. Ensure OPENAI_API_KEY is set (for embeddings)")
            logger.info("  3. Test with: python -c 'from agents.memory_manager import SemanticMemoryManager; print(\"OK\")'")
            logger.info("")

    except Exception as e:
        logger.error("")
        logger.error("❌ Migration failed!")
        logger.error(f"Error: {e}")
        logger.error("")
        logger.error("If pgvector extension is missing, install it:")
        logger.error("  - Mac: brew install pgvector")
        logger.error("  - Ubuntu: sudo apt install postgresql-16-pgvector")
        logger.error("  - Docker: Use postgres image with pgvector")
        logger.error("")
        sys.exit(1)


if __name__ == "__main__":
    run_migration()
