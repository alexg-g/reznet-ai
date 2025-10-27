"""
Database initialization utilities
Creates initial channels, agents, and DM channels
"""

from sqlalchemy.orm import Session
from models.database import Channel, Agent
from uuid import UUID
import logging

logger = logging.getLogger(__name__)


def ensure_dm_channels(db: Session) -> None:
    """
    Ensure DM channels exist for all agents
    Creates channels with pattern: dm-{agent_name}

    Args:
        db: Database session
    """
    # Get all active agents
    agents = db.query(Agent).filter(Agent.is_active == True).all()

    created_count = 0
    for agent in agents:
        # DM channel naming pattern: dm-{agent_name}
        dm_channel_name = f"dm-{agent.name}"

        # Check if DM channel already exists
        existing_channel = db.query(Channel).filter(
            Channel.name == dm_channel_name
        ).first()

        if not existing_channel:
            # Create DM channel
            dm_channel = Channel(
                name=dm_channel_name,
                topic=f"Direct message with {agent.name}",
                is_archived=False
            )
            db.add(dm_channel)
            created_count += 1
            logger.info(f"Created DM channel: {dm_channel_name}")

    if created_count > 0:
        db.commit()
        logger.info(f"✓ Created {created_count} DM channels")
    else:
        logger.info("✓ All DM channels already exist")


def initialize_default_channels(db: Session) -> None:
    """
    Create default channels if they don't exist

    Args:
        db: Database session
    """
    default_channels = [
        {
            "name": "general",
            "topic": "General discussion and announcements"
        },
        {
            "name": "development",
            "topic": "Development tasks and coordination"
        },
        {
            "name": "testing",
            "topic": "QA testing and bug reports"
        }
    ]

    created_count = 0
    for channel_data in default_channels:
        existing = db.query(Channel).filter(
            Channel.name == channel_data["name"]
        ).first()

        if not existing:
            channel = Channel(**channel_data)
            db.add(channel)
            created_count += 1
            logger.info(f"Created channel: {channel_data['name']}")

    if created_count > 0:
        db.commit()
        logger.info(f"✓ Created {created_count} default channels")
    else:
        logger.info("✓ All default channels already exist")


def initialize_default_agents(db: Session) -> None:
    """
    Create default agents if they don't exist

    Args:
        db: Database session
    """
    default_agents = [
        {
            "name": "@orchestrator",
            "agent_type": "orchestrator",
            "persona": {
                "role": "Team Lead & Orchestrator",
                "goal": "Coordinate multi-agent workflows and delegate tasks effectively",
                "backstory": "An experienced project manager who breaks down complex requests into manageable tasks and delegates to specialist agents.",
                "capabilities": [
                    "Task decomposition and planning",
                    "Agent coordination and delegation",
                    "Workflow management",
                    "Progress tracking"
                ]
            },
            "config": {
                "temperature": 0.7,
                "max_tokens": 4000,
                "enable_tools": True
            }
        },
        {
            "name": "@backend",
            "agent_type": "backend",
            "persona": {
                "role": "Backend Engineer",
                "goal": "Design and implement robust server-side applications",
                "backstory": "A senior backend developer specializing in Python/FastAPI with deep knowledge of databases, APIs, and system architecture.",
                "capabilities": [
                    "Python/FastAPI development",
                    "Database design and optimization",
                    "RESTful API development",
                    "Server-side logic implementation"
                ]
            },
            "config": {
                "temperature": 0.7,
                "max_tokens": 4000,
                "enable_tools": True
            }
        },
        {
            "name": "@frontend",
            "agent_type": "frontend",
            "persona": {
                "role": "Frontend Developer",
                "goal": "Build beautiful, accessible, and performant user interfaces",
                "backstory": "A frontend specialist with expertise in React/Next.js, TypeScript, and modern CSS. Passionate about UX and accessibility.",
                "capabilities": [
                    "React/Next.js development",
                    "TypeScript and type safety",
                    "Responsive design and CSS",
                    "Accessibility (WCAG compliance)"
                ]
            },
            "config": {
                "temperature": 0.7,
                "max_tokens": 4000,
                "enable_tools": True
            }
        },
        {
            "name": "@qa",
            "agent_type": "qa",
            "persona": {
                "role": "QA Engineer",
                "goal": "Ensure software quality through comprehensive testing",
                "backstory": "A meticulous QA engineer who thinks about edge cases and writes thorough test coverage.",
                "capabilities": [
                    "Unit and integration testing",
                    "E2E test automation",
                    "Bug detection and reporting",
                    "Test coverage analysis"
                ]
            },
            "config": {
                "temperature": 0.7,
                "max_tokens": 4000,
                "enable_tools": True
            }
        },
        {
            "name": "@devops",
            "agent_type": "devops",
            "persona": {
                "role": "DevOps Engineer",
                "goal": "Build and maintain reliable infrastructure and deployment pipelines",
                "backstory": "An infrastructure specialist focused on automation, containerization, and CI/CD best practices.",
                "capabilities": [
                    "Docker and containerization",
                    "CI/CD pipeline design",
                    "Infrastructure as code",
                    "Deployment automation"
                ]
            },
            "config": {
                "temperature": 0.7,
                "max_tokens": 4000,
                "enable_tools": True
            }
        }
    ]

    created_count = 0
    for agent_data in default_agents:
        existing = db.query(Agent).filter(
            Agent.name == agent_data["name"]
        ).first()

        if not existing:
            agent = Agent(**agent_data)
            db.add(agent)
            created_count += 1
            logger.info(f"Created agent: {agent_data['name']}")

    if created_count > 0:
        db.commit()
        logger.info(f"✓ Created {created_count} default agents")
    else:
        logger.info("✓ All default agents already exist")


def initialize_database(db: Session) -> None:
    """
    Run all database initialization tasks

    Args:
        db: Database session
    """
    logger.info("🔧 Initializing database...")

    # Initialize in order: agents first, then channels, then DM channels
    initialize_default_agents(db)
    initialize_default_channels(db)
    ensure_dm_channels(db)

    logger.info("✓ Database initialization complete")
