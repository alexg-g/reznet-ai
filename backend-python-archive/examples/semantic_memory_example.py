"""
Semantic Memory System - Quick Start Example

This example shows how to use the semantic memory system with your agents.
"""

import asyncio
from uuid import uuid4
from sqlalchemy.orm import Session

# Import your database setup
from core.database import SessionLocal

# Import memory-enabled agent
from agents.base_with_memory import BaseAgentWithMemory


# Example 1: Create a memory-enabled agent
def example_1_create_agent():
    """Create an agent with semantic memory"""

    db = SessionLocal()

    agent = BaseAgentWithMemory(
        agent_id=uuid4(),
        name="@example-agent",
        agent_type="general",
        persona={
            "role": "AI Assistant",
            "goal": "Help users with their tasks",
            "backstory": "You are a helpful AI assistant.",
            "capabilities": [
                "Answer questions",
                "Remember past conversations",
                "Provide context-aware responses"
            ]
        },
        config={
            "enable_memory": True,
            "memory_window_size": 50,
            "enable_auto_summarization": True,
            "enable_entity_extraction": False
        },
        db=db
    )

    print(f"✓ Created agent: {agent.name}")
    print(f"✓ Memory enabled: {agent.enable_memory}")
    print(f"✓ Window size: {agent.memory_window_size}")

    return agent, db


# Example 2: Have a conversation with memory
async def example_2_conversation():
    """Demonstrate memory across multiple messages"""

    agent, db = example_1_create_agent()

    # First message
    print("\n" + "=" * 60)
    print("Message 1: Introducing a topic")
    print("=" * 60)

    response1 = await agent.process_message(
        message="We're building a web app using FastAPI and React",
        context={
            "channel_id": uuid4(),
            "conversation_history": []
        }
    )
    print(f"Agent: {response1[:200]}...")

    # Second message (agent should remember first)
    print("\n" + "=" * 60)
    print("Message 2: Follow-up question")
    print("=" * 60)

    response2 = await agent.process_message(
        message="What tech stack are we using again?",
        context={
            "channel_id": uuid4(),
            "conversation_history": [
                {"author": "user", "content": "We're building a web app using FastAPI and React"},
                {"author": agent.name, "content": response1}
            ]
        }
    )
    print(f"Agent: {response2[:200]}...")

    # Check memory stats
    print("\n" + "=" * 60)
    print("Memory Statistics")
    print("=" * 60)
    stats = agent.get_memory_stats()
    print(f"Total memories: {stats.get('total_memories', 0)}")
    print(f"By type: {stats.get('by_type', {})}")
    print(f"Average importance: {stats.get('average_importance', 0)}")

    db.close()


# Example 3: Direct memory manager usage
async def example_3_memory_manager():
    """Use memory manager directly for fine-grained control"""

    from agents.memory_manager import SemanticMemoryManager

    db = SessionLocal()
    agent_id = uuid4()
    channel_id = uuid4()

    memory_manager = SemanticMemoryManager(
        agent_id=agent_id,
        db=db,
        window_size=50
    )

    print("\n" + "=" * 60)
    print("Direct Memory Manager Usage")
    print("=" * 60)

    # Store different types of memories
    print("\n1. Storing memories...")

    # Conversation
    await memory_manager.store(
        content="User discussed using PostgreSQL for the database",
        memory_type="conversation",
        importance=5,
        channel_id=channel_id,
        metadata={"author": "user"}
    )

    # Decision
    await memory_manager.store(
        content="Team decided to use JWT authentication",
        memory_type="decision",
        importance=8,
        channel_id=channel_id,
        metadata={"decision_makers": ["@backend", "@devops"]}
    )

    # Entity
    await memory_manager.store(
        content="PostgreSQL",
        memory_type="entity",
        importance=6,
        channel_id=channel_id,
        metadata={"entity_type": "technology"}
    )

    print("   ✓ Stored 3 memories")

    # Retrieve relevant memories
    print("\n2. Retrieving relevant memories...")

    memories = await memory_manager.retrieve_relevant(
        query="What database technology are we using?",
        limit=5,
        channel_id=channel_id
    )

    print(f"   Found {len(memories)} relevant memories:")
    for i, mem in enumerate(memories, 1):
        print(f"   [{i}] {mem['memory_type']}: {mem['content'][:60]}...")
        print(f"       Relevance: {mem['relevance_score']:.2f}, Importance: {mem['importance']}")

    # Get statistics
    print("\n3. Memory statistics...")

    stats = memory_manager.get_memory_stats(channel_id=channel_id)
    print(f"   Total: {stats['total_memories']}")
    print(f"   By type: {stats['by_type']}")
    print(f"   Avg importance: {stats['average_importance']}")

    db.close()


# Example 4: Create and retrieve summaries
async def example_4_summarization():
    """Demonstrate context summarization"""

    agent, db = example_1_create_agent()
    channel_id = uuid4()

    print("\n" + "=" * 60)
    print("Context Summarization")
    print("=" * 60)

    # Simulate a conversation
    messages = [
        "Let's build a task management app",
        "We'll need user authentication",
        "I suggest using JWT tokens",
        "The database should be PostgreSQL",
        "We need task CRUD operations",
        "Let's add task priority levels",
        "Frontend will be React with TypeScript",
        "We should use Tailwind for styling"
    ]

    print("\n1. Simulating conversation...")
    for msg in messages:
        await agent.process_message(
            message=msg,
            context={"channel_id": channel_id}
        )
    print(f"   ✓ Processed {len(messages)} messages")

    # Create summary
    print("\n2. Creating summary...")
    summary = await agent.create_memory_summary(channel_id=channel_id)

    print("\n   Summary:")
    print("   " + "-" * 56)
    print(f"   {summary}")
    print("   " + "-" * 56)

    db.close()


# Example 5: Memory cleanup
async def example_5_cleanup():
    """Demonstrate memory cleanup"""

    agent, db = example_1_create_agent()

    print("\n" + "=" * 60)
    print("Memory Cleanup")
    print("=" * 60)

    # Get current stats
    stats_before = agent.get_memory_stats()
    print(f"\n1. Before cleanup: {stats_before.get('total_memories', 0)} memories")

    # Clean up old memories (30+ days old, low importance)
    deleted = await agent.clear_old_memories(days_old=30)

    print(f"\n2. Cleaned up {deleted} old memories")

    # Get stats after cleanup
    stats_after = agent.get_memory_stats()
    print(f"\n3. After cleanup: {stats_after.get('total_memories', 0)} memories")

    db.close()


# Main runner
async def main():
    """Run all examples"""

    print("=" * 60)
    print("Semantic Memory System - Quick Start Examples")
    print("=" * 60)

    # Run examples
    try:
        # Example 1: Already demonstrated in other examples
        print("\n[Example 1] Creating memory-enabled agent... (see other examples)")

        # Example 2: Conversation with memory
        await example_2_conversation()

        # Example 3: Direct memory manager
        await example_3_memory_manager()

        # Example 4: Summarization
        await example_4_summarization()

        # Example 5: Cleanup
        await example_5_cleanup()

        print("\n" + "=" * 60)
        print("✅ All examples completed successfully!")
        print("=" * 60)
        print("\nNext steps:")
        print("  1. Update your agents to use BaseAgentWithMemory")
        print("  2. Configure memory settings per agent")
        print("  3. Monitor memory usage with get_memory_stats()")
        print("  4. Set up periodic cleanup jobs")
        print("\nSee SEMANTIC_MEMORY_GUIDE.md for full documentation")
        print("=" * 60)

    except Exception as e:
        print(f"\n❌ Error running examples: {e}")
        print("\nMake sure you have:")
        print("  1. Run the database migration (python migrations/run_migration.py)")
        print("  2. Set OPENAI_API_KEY in .env")
        print("  3. Installed all dependencies (pip install -r requirements.txt)")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
