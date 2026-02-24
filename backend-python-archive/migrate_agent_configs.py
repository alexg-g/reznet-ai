#!/usr/bin/env python3
"""
Database Migration: Remove hardcoded model names from agent configs

This migration removes hardcoded model names (e.g., "claude-3-5-sonnet-20241022")
from agent configurations, allowing agents to dynamically inherit the current
DEFAULT_LLM_PROVIDER setting.

Run this once after updating base.py and schema.sql.

Usage:
    python migrate_agent_configs.py
"""

import sys
from core.database import SessionLocal
from models.database import Agent


def migrate_agents():
    """Remove hardcoded model names from existing agent configs"""
    db = SessionLocal()
    try:
        agents = db.query(Agent).all()

        print(f"\n🔄 Migrating {len(agents)} agents...")
        print("=" * 60)

        updated_count = 0

        for agent in agents:
            if agent.config and "model" in agent.config:
                # Store the old model for logging
                old_model = agent.config.get("model")

                # Remove hardcoded model, keep other settings
                config = dict(agent.config)
                del config["model"]
                agent.config = config

                print(f"✓ {agent.name:20} | Removed: {old_model}")
                updated_count += 1
            else:
                print(f"  {agent.name:20} | Already migrated")

        # Commit changes
        db.commit()

        print("=" * 60)
        print(f"✅ Migration complete!")
        print(f"   - Updated: {updated_count} agents")
        print(f"   - Skipped: {len(agents) - updated_count} agents (already migrated)")
        print(f"\nℹ️  Agents will now use the provider/model from .env")
        print(f"   Current setting: DEFAULT_LLM_PROVIDER={get_current_provider()}")

        return True

    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        print(f"   Rolling back changes...")
        db.rollback()
        return False

    finally:
        db.close()


def get_current_provider():
    """Get current DEFAULT_LLM_PROVIDER from settings"""
    try:
        from core.config import settings
        return settings.DEFAULT_LLM_PROVIDER
    except:
        return "unknown"


if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("RezNet AI - Agent Config Migration")
    print("=" * 60)
    print("\nThis will remove hardcoded model names from agent configs.")
    print("Agents will dynamically inherit settings from .env\n")

    response = input("Continue? (y/N): ").strip().lower()

    if response == 'y':
        success = migrate_agents()
        sys.exit(0 if success else 1)
    else:
        print("\n⚠️  Migration cancelled")
        sys.exit(0)
