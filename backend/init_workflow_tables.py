"""
Initialize workflow tables in the database

This script creates the Workflow and WorkflowTask tables
Run this once to add workflow support to an existing database
"""

import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

from core.database import engine, Base
from models.database import Workflow, WorkflowTask
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def init_workflow_tables():
    """Create workflow tables in the database"""
    logger.info("Creating workflow tables...")

    try:
        # Import all models to ensure they're registered
        from models.database import (
            Workspace, Agent, Channel, Message,
            Task, AgentMemory, Workflow, WorkflowTask
        )

        # Create only the workflow tables
        # This creates tables for all models that don't exist yet
        Base.metadata.create_all(bind=engine, checkfirst=True)

        logger.info("✅ Workflow tables created successfully!")
        logger.info("   - workflows")
        logger.info("   - workflow_tasks")

        # Verify tables exist
        from sqlalchemy import inspect
        inspector = inspect(engine)
        tables = inspector.get_table_names()

        if 'workflows' in tables and 'workflow_tasks' in tables:
            logger.info("✅ Verification passed - tables exist in database")
            return True
        else:
            logger.error("❌ Verification failed - tables not found")
            return False

    except Exception as e:
        logger.error(f"❌ Error creating workflow tables: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    logger.info("=" * 60)
    logger.info("RezNet AI - Workflow Tables Initialization")
    logger.info("=" * 60)

    success = init_workflow_tables()

    if success:
        logger.info("=" * 60)
        logger.info("✅ SUCCESS - Workflow tables are ready!")
        logger.info("=" * 60)
        sys.exit(0)
    else:
        logger.error("=" * 60)
        logger.error("❌ FAILED - Check errors above")
        logger.error("=" * 60)
        sys.exit(1)
