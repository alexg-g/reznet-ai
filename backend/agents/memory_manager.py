"""
Semantic Memory Manager for Agent Long-Term Memory

Provides semantic retrieval, context summarization, and intelligent
memory storage for agents without framework lock-in.
"""

import logging
from typing import Dict, Any, List, Optional
from uuid import UUID
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from models.database import AgentMemory
from core.config import settings

logger = logging.getLogger(__name__)


class SemanticMemoryManager:
    """
    Manages agent long-term memory with semantic search capabilities

    Features:
    - Semantic retrieval using pgvector
    - Automatic importance scoring
    - Context summarization
    - Memory type classification
    - Access tracking for adaptive retrieval
    """

    def __init__(
        self,
        agent_id: UUID,
        db: Session,
        embedding_provider: Optional[str] = None,
        window_size: int = 50,
        enable_summarization: bool = True
    ):
        """
        Initialize memory manager for an agent

        Args:
            agent_id: Agent UUID
            db: Database session
            embedding_provider: LLM provider for embeddings (anthropic, openai, ollama)
            window_size: Number of recent messages to keep in context
            enable_summarization: Whether to auto-summarize old context
        """
        self.agent_id = agent_id
        self.db = db
        self.window_size = window_size
        self.enable_summarization = enable_summarization

        # Embedding configuration
        self.embedding_provider = embedding_provider or settings.DEFAULT_EMBEDDING_PROVIDER
        self.embedding_model = settings.EMBEDDING_MODEL

        logger.info(
            f"Initialized SemanticMemoryManager for agent {agent_id} "
            f"(window: {window_size}, provider: {self.embedding_provider})"
        )

    async def store(
        self,
        content: str,
        memory_type: str = "conversation",
        importance: int = 5,
        channel_id: Optional[UUID] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> AgentMemory:
        """
        Store a new memory with semantic embedding

        Args:
            content: Memory content (message, decision, entity, etc.)
            memory_type: Type of memory (conversation, decision, entity, summary, tool_use)
            importance: Importance score 1-10 (affects retrieval priority)
            channel_id: Associated channel (for context-aware retrieval)
            metadata: Additional metadata (message_id, author, entities, etc.)

        Returns:
            Created AgentMemory object
        """
        try:
            # Generate embedding
            embedding = await self._generate_embedding(content)

            # Create memory record
            memory = AgentMemory(
                agent_id=self.agent_id,
                channel_id=channel_id,
                content=content,
                embedding=embedding,
                memory_type=memory_type,
                importance=importance,
                mem_metadata=metadata or {},
                access_count=0
            )

            self.db.add(memory)
            self.db.commit()
            self.db.refresh(memory)

            logger.debug(
                f"Stored {memory_type} memory for agent {self.agent_id}: "
                f"{content[:50]}... (importance: {importance})"
            )

            return memory

        except Exception as e:
            logger.error(f"Error storing memory: {e}")
            self.db.rollback()
            raise

    async def retrieve_relevant(
        self,
        query: str,
        limit: int = 5,
        memory_types: Optional[List[str]] = None,
        channel_id: Optional[UUID] = None,
        min_importance: int = 3,
        exclude_recent_count: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Retrieve semantically relevant memories

        Args:
            query: Query text to find relevant memories
            limit: Maximum number of memories to retrieve
            memory_types: Filter by memory types (e.g., ['conversation', 'decision'])
            channel_id: Filter by channel
            min_importance: Minimum importance score
            exclude_recent_count: Exclude N most recent memories (already in context)

        Returns:
            List of memory dicts with content, metadata, and relevance scores
        """
        try:
            # Generate query embedding
            query_embedding = await self._generate_embedding(query)

            # Build query
            query_obj = self.db.query(
                AgentMemory,
                AgentMemory.embedding.cosine_distance(query_embedding).label('distance')
            ).filter(
                AgentMemory.agent_id == self.agent_id,
                AgentMemory.importance >= min_importance
            )

            # Apply filters
            if memory_types:
                query_obj = query_obj.filter(AgentMemory.memory_type.in_(memory_types))

            if channel_id:
                query_obj = query_obj.filter(AgentMemory.channel_id == channel_id)

            # Get results ordered by similarity
            results = query_obj.order_by('distance').limit(limit + exclude_recent_count).all()

            # Skip most recent N (they're already in recent context)
            results = results[exclude_recent_count:]

            # Format results
            memories = []
            for memory, distance in results[:limit]:
                # Update access tracking
                memory.access_count += 1
                memory.accessed_at = datetime.now(timezone.utc)

                memories.append({
                    'id': str(memory.id),
                    'content': memory.content,
                    'memory_type': memory.memory_type,
                    'importance': memory.importance,
                    'relevance_score': 1.0 - distance,  # Convert distance to similarity
                    'metadata': memory.mem_metadata,
                    'created_at': memory.created_at.isoformat(),
                    'access_count': memory.access_count
                })

            self.db.commit()

            logger.debug(
                f"Retrieved {len(memories)} relevant memories for agent {self.agent_id} "
                f"(query: {query[:30]}...)"
            )

            return memories

        except Exception as e:
            logger.error(f"Error retrieving memories: {e}")
            return []

    async def get_recent_memories(
        self,
        limit: int = 10,
        channel_id: Optional[UUID] = None
    ) -> List[Dict[str, Any]]:
        """
        Get most recent memories (for building context window)

        Args:
            limit: Number of recent memories to retrieve
            channel_id: Filter by channel

        Returns:
            List of recent memory dicts
        """
        query_obj = self.db.query(AgentMemory).filter(
            AgentMemory.agent_id == self.agent_id
        )

        if channel_id:
            query_obj = query_obj.filter(AgentMemory.channel_id == channel_id)

        memories = query_obj.order_by(
            desc(AgentMemory.created_at)
        ).limit(limit).all()

        return [
            {
                'id': str(m.id),
                'content': m.content,
                'memory_type': m.memory_type,
                'importance': m.importance,
                'metadata': m.mem_metadata,
                'created_at': m.created_at.isoformat()
            }
            for m in reversed(memories)  # Return in chronological order
        ]

    async def get_summary(
        self,
        channel_id: Optional[UUID] = None,
        time_window_hours: int = 24
    ) -> Optional[str]:
        """
        Get most recent summary of agent's memory

        Args:
            channel_id: Filter by channel
            time_window_hours: Look for summaries within this timeframe

        Returns:
            Summary text or None if no recent summary exists
        """
        from datetime import timedelta
        cutoff_time = datetime.now(timezone.utc) - timedelta(hours=time_window_hours)

        query_obj = self.db.query(AgentMemory).filter(
            AgentMemory.agent_id == self.agent_id,
            AgentMemory.memory_type == 'summary',
            AgentMemory.created_at >= cutoff_time
        )

        if channel_id:
            query_obj = query_obj.filter(AgentMemory.channel_id == channel_id)

        summary = query_obj.order_by(desc(AgentMemory.created_at)).first()

        return summary.content if summary else None

    async def create_summary(
        self,
        llm_client,
        channel_id: Optional[UUID] = None,
        memory_count: int = 20
    ) -> str:
        """
        Create a summary of recent memories using LLM

        Args:
            llm_client: LLMClient instance for generating summary
            channel_id: Channel to summarize
            memory_count: Number of recent memories to summarize

        Returns:
            Summary text
        """
        # Get recent memories
        recent_memories = await self.get_recent_memories(
            limit=memory_count,
            channel_id=channel_id
        )

        if not recent_memories:
            return "No recent activity to summarize."

        # Build prompt for summarization
        memory_text = "\n".join([
            f"[{m['memory_type']}] {m['content']}"
            for m in recent_memories
        ])

        prompt = f"""Summarize the following conversation and decisions into a concise overview:

{memory_text}

Provide a brief summary (3-5 sentences) highlighting:
- Key topics discussed
- Important decisions made
- Files or entities mentioned
- Current project status

Summary:"""

        # Generate summary
        summary_text, _ = await llm_client.generate(
            prompt=prompt,
            system="You are a helpful assistant that creates concise summaries.",
            temperature=0.3,
            max_tokens=300
        )

        # Store summary as memory
        await self.store(
            content=summary_text,
            memory_type='summary',
            importance=8,
            channel_id=channel_id,
            metadata={'summarized_count': len(recent_memories)}
        )

        logger.info(f"Created summary for agent {self.agent_id} ({len(recent_memories)} memories)")

        return summary_text

    async def extract_and_store_entities(
        self,
        text: str,
        llm_client,
        channel_id: Optional[UUID] = None
    ) -> List[str]:
        """
        Extract entities from text and store them as memories

        Args:
            text: Text to extract entities from
            llm_client: LLMClient instance
            channel_id: Associated channel

        Returns:
            List of extracted entity names
        """
        # Prompt for entity extraction
        prompt = f"""Extract key entities from the following text. Include:
- People names
- File paths
- Technologies/tools
- Important concepts

Text: {text}

List entities (one per line):"""

        response, _ = await llm_client.generate(
            prompt=prompt,
            system="You are a helpful assistant that extracts entities from text.",
            temperature=0.1,
            max_tokens=200
        )

        # Parse entities
        entities = [
            line.strip().lstrip('-').strip()
            for line in response.split('\n')
            if line.strip() and len(line.strip()) > 2
        ]

        # Store each entity as memory
        for entity in entities[:10]:  # Limit to 10 entities
            await self.store(
                content=entity,
                memory_type='entity',
                importance=6,
                channel_id=channel_id,
                metadata={'source_text': text[:100]}
            )

        logger.debug(f"Extracted and stored {len(entities)} entities")

        return entities

    async def _generate_embedding(self, text: str) -> List[float]:
        """
        Generate embedding vector for text

        Args:
            text: Text to embed

        Returns:
            Embedding vector (768 dimensions for nomic-embed-text, 1536 for OpenAI)
        """
        # Route to appropriate embedding provider
        if self.embedding_provider == "ollama":
            return await self._generate_ollama_embedding(text)
        elif self.embedding_provider == "openai":
            return await self._generate_openai_embedding(text)
        elif self.embedding_provider == "anthropic":
            # Anthropic doesn't have embeddings, fallback to Ollama or OpenAI
            logger.warning("Anthropic doesn't provide embeddings, trying Ollama first")
            try:
                return await self._generate_ollama_embedding(text)
            except Exception as e:
                logger.warning(f"Ollama fallback failed: {e}, trying OpenAI")
                return await self._generate_openai_embedding(text)
        else:
            raise ValueError(f"Unknown embedding provider: {self.embedding_provider}")

    async def _generate_ollama_embedding(self, text: str) -> List[float]:
        """
        Generate embedding using Ollama local models

        Args:
            text: Text to embed

        Returns:
            Embedding vector (768 dimensions for nomic-embed-text)
        """
        import httpx

        embedding_model = settings.OLLAMA_EMBEDDING_MODEL

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{settings.OLLAMA_HOST}/api/embeddings",
                    json={
                        "model": embedding_model,
                        "prompt": text
                    }
                )
                response.raise_for_status()
                data = response.json()

                if "embedding" not in data:
                    raise ValueError(f"Ollama response missing 'embedding' field: {data}")

                embedding = data["embedding"]

                logger.debug(
                    f"Generated Ollama embedding with {embedding_model} "
                    f"({len(embedding)} dimensions)"
                )

                return embedding

        except httpx.HTTPError as e:
            logger.error(f"Ollama HTTP error: {e}")
            raise ValueError(
                f"Failed to generate Ollama embedding. "
                f"Is Ollama running at {settings.OLLAMA_HOST}? "
                f"Have you pulled {embedding_model}? (ollama pull {embedding_model})"
            ) from e
        except Exception as e:
            logger.error(f"Ollama embedding generation failed: {e}")
            raise

    async def _generate_openai_embedding(self, text: str) -> List[float]:
        """Generate embedding using OpenAI API"""
        import openai

        if not settings.OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY required for embeddings")

        client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

        response = await client.embeddings.create(
            model=self.embedding_model,
            input=text
        )

        return response.data[0].embedding

    def get_memory_stats(self, channel_id: Optional[UUID] = None) -> Dict[str, Any]:
        """
        Get statistics about agent's memory

        Args:
            channel_id: Filter by channel

        Returns:
            Dict with memory statistics
        """
        query_obj = self.db.query(AgentMemory).filter(
            AgentMemory.agent_id == self.agent_id
        )

        if channel_id:
            query_obj = query_obj.filter(AgentMemory.channel_id == channel_id)

        total_count = query_obj.count()

        # Count by type
        type_counts = {}
        for memory_type in ['conversation', 'decision', 'entity', 'summary', 'tool_use']:
            count = query_obj.filter(AgentMemory.memory_type == memory_type).count()
            type_counts[memory_type] = count

        # Average importance
        avg_importance = self.db.query(
            func.avg(AgentMemory.importance)
        ).filter(
            AgentMemory.agent_id == self.agent_id
        ).scalar() or 0

        return {
            'total_memories': total_count,
            'by_type': type_counts,
            'average_importance': round(avg_importance, 2)
        }

    async def cleanup_old_memories(
        self,
        days_old: int = 30,
        keep_important: bool = True,
        min_importance_to_keep: int = 7
    ) -> int:
        """
        Clean up old, low-importance memories to manage database size

        Args:
            days_old: Delete memories older than this many days
            keep_important: Keep important memories regardless of age
            min_importance_to_keep: Minimum importance to keep if keep_important=True

        Returns:
            Number of memories deleted
        """
        from datetime import timedelta
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=days_old)

        query_obj = self.db.query(AgentMemory).filter(
            AgentMemory.agent_id == self.agent_id,
            AgentMemory.created_at < cutoff_date
        )

        if keep_important:
            query_obj = query_obj.filter(
                AgentMemory.importance < min_importance_to_keep
            )

        count = query_obj.count()
        query_obj.delete()
        self.db.commit()

        logger.info(f"Cleaned up {count} old memories for agent {self.agent_id}")

        return count
