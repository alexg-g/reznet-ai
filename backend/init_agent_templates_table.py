"""
Initialize agent_templates table in the database

This script creates the AgentTemplate table for custom agent creation (Issue #18)
Run this once to add agent template support to an existing database
"""

import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

from core.database import engine, Base, SessionLocal
from models.database import AgentTemplate
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def init_agent_templates_table():
    """Create agent_templates table in the database"""
    logger.info("Creating agent_templates table...")

    try:
        # Import all models to ensure they're registered
        from models.database import (
            Workspace, Agent, Channel, Message,
            Task, AgentMemory, Workflow, WorkflowTask,
            UploadedFile, AgentTemplate
        )

        # Create all tables (including agent_templates)
        # checkfirst=True ensures we don't try to recreate existing tables
        Base.metadata.create_all(bind=engine, checkfirst=True)

        logger.info("✅ Agent templates table created successfully!")
        logger.info("   - agent_templates")

        # Verify table exists
        from sqlalchemy import inspect
        inspector = inspect(engine)
        tables = inspector.get_table_names()

        if 'agent_templates' in tables:
            logger.info("✅ Verification passed - table exists in database")

            # Seed default templates
            logger.info("Seeding default agent templates...")
            seed_default_templates()

            return True
        else:
            logger.error("❌ Verification failed - table not found")
            return False

    except Exception as e:
        logger.error(f"❌ Error creating agent_templates table: {e}")
        import traceback
        traceback.print_exc()
        return False


def seed_default_templates():
    """Seed default agent templates for the 5 specialist agents"""
    db = SessionLocal()

    try:
        default_templates = [
            {
                "name": "orchestrator",
                "display_name": "Orchestrator",
                "role": "Project Manager & Task Coordinator",
                "system_prompt": "You are the Orchestrator, the team lead responsible for coordinating AI agents and managing complex software development workflows.",
                "color": "#9D00FF",
                "icon": "🎯",
                "template_type": "default",
                "domain": "software-dev",
                "is_public": True
            },
            {
                "name": "backend",
                "display_name": "Backend Engineer",
                "role": "Python/FastAPI Backend Developer",
                "system_prompt": "You are a Backend Engineer specializing in Python, FastAPI, SQLAlchemy, and database design.",
                "color": "#00F6FF",
                "icon": "⚙️",
                "template_type": "default",
                "domain": "software-dev",
                "is_public": True
            },
            {
                "name": "frontend",
                "display_name": "Frontend Developer",
                "role": "React/Next.js Frontend Developer",
                "system_prompt": "You are a Frontend Developer specializing in React, Next.js, TypeScript, and modern UI/UX design.",
                "color": "#FF00F7",
                "icon": "🎨",
                "template_type": "default",
                "domain": "software-dev",
                "is_public": True
            },
            {
                "name": "qa",
                "display_name": "QA Specialist",
                "role": "Testing & Quality Assurance Engineer",
                "system_prompt": "You are a QA Specialist responsible for testing, quality assurance, and ensuring code reliability.",
                "color": "#39FF14",
                "icon": "✅",
                "template_type": "default",
                "domain": "software-dev",
                "is_public": True
            },
            {
                "name": "devops",
                "display_name": "DevOps Engineer",
                "role": "Infrastructure & Deployment Specialist",
                "system_prompt": "You are a DevOps Engineer specializing in Docker, CI/CD, deployment, and infrastructure management.",
                "color": "#FF6B00",
                "icon": "🚀",
                "template_type": "default",
                "domain": "software-dev",
                "is_public": True
            }
        ]

        created_count = 0
        for template_data in default_templates:
            # Check if template already exists
            existing = db.query(AgentTemplate).filter(
                AgentTemplate.name == template_data["name"]
            ).first()

            if not existing:
                template = AgentTemplate(**template_data)
                db.add(template)
                created_count += 1
                logger.info(f"   Created template: {template_data['name']}")

        if created_count > 0:
            db.commit()
            logger.info(f"✅ Seeded {created_count} default templates")
        else:
            logger.info("✅ Default templates already exist")

    except Exception as e:
        logger.error(f"❌ Error seeding default templates: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    logger.info("=" * 60)
    logger.info("RezNet AI - Agent Templates Table Initialization")
    logger.info("=" * 60)

    success = init_agent_templates_table()

    if success:
        logger.info("=" * 60)
        logger.info("✅ SUCCESS - Agent templates table is ready!")
        logger.info("=" * 60)
        logger.info("")
        logger.info("Next steps:")
        logger.info("1. Restart the backend server")
        logger.info("2. Test the API at http://localhost:8000/docs")
        logger.info("3. Try creating a custom agent template:")
        logger.info("   POST /api/agent-templates")
        logger.info("=" * 60)
        sys.exit(0)
    else:
        logger.error("=" * 60)
        logger.error("❌ FAILED - Check errors above")
        logger.error("=" * 60)
        sys.exit(1)
