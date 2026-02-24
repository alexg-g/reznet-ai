"""
Enhanced Base Agent class with Semantic Memory

This extends BaseAgent with semantic memory capabilities while maintaining
full control over system prompts and architecture.
"""

from typing import Dict, Any, Optional, List
import logging
from uuid import UUID
from sqlalchemy.orm import Session

from agents.base import BaseAgent
from agents.memory_manager import SemanticMemoryManager
from core.config import settings

logger = logging.getLogger(__name__)


class BaseAgentWithMemory(BaseAgent):
    """
    Base agent enhanced with semantic memory capabilities

    Key features:
    - Semantic retrieval of past context
    - Automatic memory storage
    - Context summarization
    - Entity extraction
    - Maintains 100% system prompt control
    """

    def __init__(
        self,
        agent_id: UUID,
        name: str,
        agent_type: str,
        persona: Dict[str, Any],
        config: Optional[Dict[str, Any]] = None,
        db: Optional[Session] = None
    ):
        """
        Initialize agent with memory capabilities

        Args:
            agent_id: Agent UUID
            name: Agent name (e.g., "@backend")
            agent_type: Agent type (backend, frontend, qa, etc.)
            persona: Agent persona dict
            config: Optional config dict
            db: Database session for memory operations (optional, can be set later)
        """
        # Initialize base agent (full control over system prompts maintained)
        super().__init__(agent_id, name, agent_type, persona, config)

        # Memory configuration
        self.enable_memory = config.get("enable_memory", settings.ENABLE_AGENT_MEMORY)
        self.memory_window_size = config.get("memory_window_size", 50)
        self.enable_auto_summarization = config.get("enable_auto_summarization", True)
        self.enable_entity_extraction = config.get("enable_entity_extraction", False)

        # Memory manager (initialized lazily with DB session)
        self._memory_manager: Optional[SemanticMemoryManager] = None
        self._db_session = db

        if self.enable_memory:
            logger.info(
                f"Memory enabled for {self.name} "
                f"(window: {self.memory_window_size}, summarization: {self.enable_auto_summarization})"
            )

    def set_db_session(self, db: Session):
        """Set database session (for lazy initialization)"""
        self._db_session = db
        self._memory_manager = None  # Reset to reinitialize with new session

    def _get_memory_manager(self) -> Optional[SemanticMemoryManager]:
        """Get or create memory manager instance"""
        if not self.enable_memory or not self._db_session:
            return None

        if self._memory_manager is None:
            self._memory_manager = SemanticMemoryManager(
                agent_id=self.id,
                db=self._db_session,
                embedding_provider=self.llm.provider,
                window_size=self.memory_window_size,
                enable_summarization=self.enable_auto_summarization
            )

        return self._memory_manager

    async def process_message(
        self,
        message: str,
        context: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Process message with semantic memory enhancement

        Args:
            message: User message
            context: Additional context (enhanced with semantic memories)

        Returns:
            Agent response
        """
        # Enhance context with semantic memory if enabled
        if self.enable_memory:
            context = await self._enhance_context_with_memory(message, context)

        # Process message using parent implementation (full prompt control maintained)
        response = await super().process_message(message, context)

        # Store interaction in memory
        if self.enable_memory and self._get_memory_manager():
            await self._store_interaction_memory(message, response, context)

        return response

    async def _enhance_context_with_memory(
        self,
        message: str,
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Enhance context with semantically relevant memories

        Args:
            message: Current message
            context: Existing context

        Returns:
            Enhanced context with semantic memories
        """
        context = context or {}
        memory_manager = self._get_memory_manager()

        if not memory_manager:
            return context

        try:
            # Get channel_id from context if available
            channel_id = context.get("channel_id")

            # Retrieve semantically relevant memories
            recent_count = len(context.get("conversation_history", []))
            relevant_memories = await memory_manager.retrieve_relevant(
                query=message,
                limit=5,
                channel_id=channel_id,
                min_importance=4,
                exclude_recent_count=recent_count
            )

            if relevant_memories:
                context["relevant_memories"] = relevant_memories
                logger.debug(
                    f"Enhanced context with {len(relevant_memories)} relevant memories for {self.name}"
                )

            # Get recent summary if available
            summary = await memory_manager.get_summary(channel_id=channel_id)
            if summary:
                context["context_summary"] = summary

        except Exception as e:
            logger.error(f"Error enhancing context with memory: {e}")

        return context

    async def _store_interaction_memory(
        self,
        message: str,
        response: str,
        context: Optional[Dict[str, Any]] = None
    ):
        """
        Store interaction in memory

        Args:
            message: User message
            response: Agent response
            context: Context dict
        """
        memory_manager = self._get_memory_manager()
        if not memory_manager:
            return

        try:
            context = context or {}
            channel_id = context.get("channel_id")

            # Store user message
            await memory_manager.store(
                content=f"User: {message}",
                memory_type="conversation",
                importance=5,
                channel_id=channel_id,
                metadata={
                    "author": "user",
                    "message_type": "question"
                }
            )

            # Store agent response
            await memory_manager.store(
                content=f"{self.name}: {response}",
                memory_type="conversation",
                importance=5,
                channel_id=channel_id,
                metadata={
                    "author": self.name,
                    "message_type": "response"
                }
            )

            # Extract entities if enabled
            if self.enable_entity_extraction and len(message + response) > 100:
                await memory_manager.extract_and_store_entities(
                    text=message + " " + response,
                    llm_client=self.llm,
                    channel_id=channel_id
                )

            logger.debug(f"Stored interaction memory for {self.name}")

        except Exception as e:
            logger.error(f"Error storing interaction memory: {e}")

    def _build_prompt(self, message: str, context: Optional[Dict[str, Any]] = None) -> str:
        """
        Build prompt with semantic memory integration

        This enhances the parent's _build_prompt with semantic memories
        while maintaining full control over system prompts.

        Args:
            message: User message
            context: Enhanced context (may include relevant_memories)

        Returns:
            Complete prompt string
        """
        prompt_parts = []
        context = context or {}

        # Add workspace instructions first (from parent)
        if context.get("workspace_instructions"):
            prompt_parts.append(context["workspace_instructions"])
            prompt_parts.append("")

        # Add context summary if available
        if context.get("context_summary"):
            prompt_parts.append("Previous Context Summary:")
            prompt_parts.append(context["context_summary"])
            prompt_parts.append("")

        # Add recent conversation history (from parent)
        if context.get("conversation_history"):
            prompt_parts.append("Recent Conversation:")
            for msg in context["conversation_history"][-10:]:  # Last 10 messages
                prompt_parts.append(f"- {msg.get('author')}: {msg.get('content')[:150]}")
            prompt_parts.append("")

        # NEW: Add semantically relevant memories
        if context.get("relevant_memories"):
            prompt_parts.append("Relevant Past Context (from long-term memory):")
            for memory in context["relevant_memories"]:
                relevance = memory.get('relevance_score', 0)
                content = memory.get('content', '')
                prompt_parts.append(f"- [{relevance:.2f}] {content[:150]}")
            prompt_parts.append("")

        # Add previous task outputs (from parent)
        if context.get("previous_task_outputs"):
            prompt_parts.append("Previous task outputs (from tasks you depend on):")
            for dep in context["previous_task_outputs"]:
                prompt_parts.append(f"- {dep.get('agent')} completed: {dep.get('task')}")
                prompt_parts.append(f"  Result: {dep.get('output', '')[:200]}...")
            prompt_parts.append("")

        # Add files context (from parent)
        if context.get("files"):
            prompt_parts.append("Relevant files:")
            for file in context["files"]:
                prompt_parts.append(f"- {file.get('path')}")
            prompt_parts.append("")

        # Add project info (from parent)
        if context.get("project_info"):
            prompt_parts.append(f"Project context: {context['project_info']}")
            prompt_parts.append("")

        # Add workflow context (from parent)
        if context.get("workflow_request"):
            prompt_parts.append(f"Overall workflow goal: {context['workflow_request']}")
            prompt_parts.append(f"This is task {context.get('task_number', '?')} of {context.get('total_tasks', '?')}")
            prompt_parts.append("")

        # Add the actual task/message
        prompt_parts.append("YOUR TASK:")
        prompt_parts.append(message)

        return "\n".join(prompt_parts)

    async def create_memory_summary(self, channel_id: Optional[UUID] = None) -> str:
        """
        Create a summary of recent memories

        Args:
            channel_id: Channel to summarize

        Returns:
            Summary text
        """
        memory_manager = self._get_memory_manager()
        if not memory_manager:
            return "Memory not enabled for this agent."

        return await memory_manager.create_summary(
            llm_client=self.llm,
            channel_id=channel_id,
            memory_count=20
        )

    def get_memory_stats(self, channel_id: Optional[UUID] = None) -> Dict[str, Any]:
        """
        Get memory statistics

        Args:
            channel_id: Optional channel filter

        Returns:
            Memory statistics dict
        """
        memory_manager = self._get_memory_manager()
        if not memory_manager:
            return {"enabled": False}

        stats = memory_manager.get_memory_stats(channel_id=channel_id)
        stats["enabled"] = True
        stats["window_size"] = self.memory_window_size
        return stats

    async def clear_old_memories(self, days_old: int = 30) -> int:
        """
        Clean up old, low-importance memories

        Args:
            days_old: Delete memories older than this many days

        Returns:
            Number of memories deleted
        """
        memory_manager = self._get_memory_manager()
        if not memory_manager:
            return 0

        return await memory_manager.cleanup_old_memories(days_old=days_old)
