"""
Redis Cache Manager for RezNet AI

Implements caching layer for frequently accessed data to reduce database load.
Performance target (NFR): 60%+ reduction in repeated database queries

Cache Strategy:
- Agent configurations: 1 hour TTL (rarely change)
- Channel metadata: 10 minutes TTL (moderate change rate)
- Workflow status: 1 minute TTL (high change rate)
"""

import redis
import json
import logging
from typing import Optional, Any, Dict, List
from uuid import UUID
from datetime import datetime
from functools import wraps

from core.config import settings

logger = logging.getLogger(__name__)


class CacheManager:
    """
    Redis cache manager with TTL support and JSON serialization.

    Features:
    - Automatic JSON serialization/deserialization
    - TTL-based expiration
    - Cache hit/miss tracking
    - Namespace support for organized keys
    - Bulk operations for cache warming
    """

    def __init__(self):
        """Initialize Redis connection"""
        try:
            self.redis_client = redis.from_url(
                settings.REDIS_URL,
                decode_responses=True,  # Auto-decode bytes to strings
                socket_connect_timeout=5,
                socket_keepalive=True,
                health_check_interval=30
            )
            # Test connection
            self.redis_client.ping()
            logger.info("Redis cache connection established")

            # Initialize metrics
            self.metrics = {
                "hits": 0,
                "misses": 0,
                "sets": 0,
                "deletes": 0,
                "errors": 0
            }
        except redis.RedisError as e:
            logger.error(f"Redis connection failed: {e}")
            self.redis_client = None

    def _make_key(self, namespace: str, key: str) -> str:
        """
        Generate namespaced cache key

        Format: reznet:{namespace}:{key}
        Example: reznet:agents:@orchestrator
        """
        return f"reznet:{namespace}:{key}"

    def _serialize(self, value: Any) -> str:
        """
        Serialize Python object to JSON string

        Handles:
        - UUID -> string conversion
        - datetime -> ISO format
        - Complex nested objects
        """
        def default_converter(obj):
            if isinstance(obj, UUID):
                return str(obj)
            elif isinstance(obj, datetime):
                return obj.isoformat()
            elif hasattr(obj, '__dict__'):
                # SQLAlchemy models
                return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}
            raise TypeError(f"Object of type {type(obj)} is not JSON serializable")

        return json.dumps(value, default=default_converter)

    def _deserialize(self, value: str) -> Any:
        """Deserialize JSON string to Python object"""
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            logger.error(f"Failed to deserialize cache value: {value[:100]}")
            return None

    def get(self, namespace: str, key: str) -> Optional[Any]:
        """
        Get value from cache

        Returns:
            Cached value or None if not found/expired
        """
        if not self.redis_client:
            return None

        try:
            cache_key = self._make_key(namespace, key)
            value = self.redis_client.get(cache_key)

            if value:
                self.metrics["hits"] += 1
                logger.debug(f"Cache HIT: {cache_key}")
                return self._deserialize(value)
            else:
                self.metrics["misses"] += 1
                logger.debug(f"Cache MISS: {cache_key}")
                return None
        except redis.RedisError as e:
            self.metrics["errors"] += 1
            logger.error(f"Redis GET error for {namespace}:{key}: {e}")
            return None

    def set(self, namespace: str, key: str, value: Any, ttl: int) -> bool:
        """
        Set value in cache with TTL

        Args:
            namespace: Cache namespace (e.g., 'agents', 'channels')
            key: Cache key (e.g., agent_id, channel_id)
            value: Value to cache (will be JSON serialized)
            ttl: Time to live in seconds

        Returns:
            True if successful, False otherwise
        """
        if not self.redis_client:
            return False

        try:
            cache_key = self._make_key(namespace, key)
            serialized = self._serialize(value)
            self.redis_client.setex(cache_key, ttl, serialized)
            self.metrics["sets"] += 1
            logger.debug(f"Cache SET: {cache_key} (TTL: {ttl}s)")
            return True
        except redis.RedisError as e:
            self.metrics["errors"] += 1
            logger.error(f"Redis SET error for {namespace}:{key}: {e}")
            return False
        except Exception as e:
            self.metrics["errors"] += 1
            logger.error(f"Serialization error for {namespace}:{key}: {e}")
            return False

    def delete(self, namespace: str, key: str) -> bool:
        """
        Delete value from cache

        Used for cache invalidation when data is updated
        """
        if not self.redis_client:
            return False

        try:
            cache_key = self._make_key(namespace, key)
            result = self.redis_client.delete(cache_key)
            self.metrics["deletes"] += 1
            logger.debug(f"Cache DELETE: {cache_key}")
            return result > 0
        except redis.RedisError as e:
            self.metrics["errors"] += 1
            logger.error(f"Redis DELETE error for {namespace}:{key}: {e}")
            return False

    def delete_pattern(self, namespace: str, pattern: str = "*") -> int:
        """
        Delete all keys matching pattern in namespace

        Example: delete_pattern("agents", "*") -> deletes all agent cache
        """
        if not self.redis_client:
            return 0

        try:
            cache_pattern = self._make_key(namespace, pattern)
            keys = self.redis_client.keys(cache_pattern)
            if keys:
                count = self.redis_client.delete(*keys)
                self.metrics["deletes"] += count
                logger.info(f"Cache DELETE PATTERN: {cache_pattern} ({count} keys)")
                return count
            return 0
        except redis.RedisError as e:
            self.metrics["errors"] += 1
            logger.error(f"Redis DELETE PATTERN error for {namespace}:{pattern}: {e}")
            return 0

    def mget(self, namespace: str, keys: List[str]) -> Dict[str, Any]:
        """
        Get multiple values in one operation (bulk read)

        Returns:
            Dict mapping keys to values (only keys with hits)
        """
        if not self.redis_client or not keys:
            return {}

        try:
            cache_keys = [self._make_key(namespace, key) for key in keys]
            values = self.redis_client.mget(cache_keys)

            result = {}
            for key, value in zip(keys, values):
                if value:
                    self.metrics["hits"] += 1
                    result[key] = self._deserialize(value)
                else:
                    self.metrics["misses"] += 1

            logger.debug(f"Cache MGET: {namespace} ({len(result)}/{len(keys)} hits)")
            return result
        except redis.RedisError as e:
            self.metrics["errors"] += 1
            logger.error(f"Redis MGET error for {namespace}: {e}")
            return {}

    def mset(self, namespace: str, items: Dict[str, Any], ttl: int) -> int:
        """
        Set multiple values in one operation (bulk write)

        Args:
            namespace: Cache namespace
            items: Dict mapping keys to values
            ttl: Time to live for all items

        Returns:
            Number of items successfully cached
        """
        if not self.redis_client or not items:
            return 0

        try:
            # Redis MSET doesn't support TTL, so use pipeline
            pipe = self.redis_client.pipeline()
            for key, value in items.items():
                cache_key = self._make_key(namespace, key)
                serialized = self._serialize(value)
                pipe.setex(cache_key, ttl, serialized)

            pipe.execute()
            count = len(items)
            self.metrics["sets"] += count
            logger.debug(f"Cache MSET: {namespace} ({count} items, TTL: {ttl}s)")
            return count
        except redis.RedisError as e:
            self.metrics["errors"] += 1
            logger.error(f"Redis MSET error for {namespace}: {e}")
            return 0
        except Exception as e:
            self.metrics["errors"] += 1
            logger.error(f"Serialization error in MSET for {namespace}: {e}")
            return 0

    def get_metrics(self) -> Dict[str, Any]:
        """
        Get cache performance metrics

        Returns:
            Dict with hit rate, total operations, etc.
        """
        total_reads = self.metrics["hits"] + self.metrics["misses"]
        hit_rate = (self.metrics["hits"] / total_reads * 100) if total_reads > 0 else 0

        return {
            **self.metrics,
            "total_reads": total_reads,
            "hit_rate_percent": round(hit_rate, 2),
            "redis_connected": self.redis_client is not None
        }

    def reset_metrics(self):
        """Reset metrics counters (for testing)"""
        self.metrics = {
            "hits": 0,
            "misses": 0,
            "sets": 0,
            "deletes": 0,
            "errors": 0
        }
        logger.info("Cache metrics reset")

    def flush_all(self):
        """
        Flush all RezNet cache keys

        WARNING: Only use in development/testing
        """
        if not self.redis_client:
            return 0

        try:
            # Only flush reznet:* keys (don't affect other Redis data)
            keys = self.redis_client.keys("reznet:*")
            if keys:
                count = self.redis_client.delete(*keys)
                logger.warning(f"Cache FLUSH ALL: {count} keys deleted")
                return count
            return 0
        except redis.RedisError as e:
            logger.error(f"Redis FLUSH error: {e}")
            return 0


# Global cache instance
cache = CacheManager()


# TTL Constants (in seconds)
class CacheTTL:
    """Cache TTL constants per data type"""
    AGENT_CONFIG = 3600      # 1 hour - agents rarely change
    CHANNEL_METADATA = 600   # 10 minutes - moderate change rate
    WORKFLOW_STATUS = 60     # 1 minute - high change rate
    AGENT_LIST = 1800        # 30 minutes - list of all agents
    MESSAGE_COUNT = 300      # 5 minutes - message statistics


def cached(namespace: str, ttl: int, key_param: str = "id"):
    """
    Decorator for caching function results

    Usage:
        @cached(namespace="agents", ttl=CacheTTL.AGENT_CONFIG, key_param="agent_id")
        async def get_agent(agent_id: UUID, db: Session):
            # Function implementation
            pass

    Args:
        namespace: Cache namespace
        ttl: Time to live in seconds
        key_param: Parameter name to use as cache key
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Extract key from function parameters
            if key_param in kwargs:
                key_value = str(kwargs[key_param])
            elif len(args) > 0:
                key_value = str(args[0])
            else:
                # Can't cache without a key
                return await func(*args, **kwargs)

            # Try cache first
            cached_value = cache.get(namespace, key_value)
            if cached_value is not None:
                return cached_value

            # Cache miss - execute function
            result = await func(*args, **kwargs)

            # Cache result if not None
            if result is not None:
                cache.set(namespace, key_value, result, ttl)

            return result

        return wrapper
    return decorator


def warm_cache_on_startup(db):
    """
    Warm cache with frequently accessed data on application startup

    Pre-loads:
    - Default agents (5 agents)
    - Active channels

    This reduces cold start latency and ensures fast first requests.
    """
    from models.database import Agent, Channel

    try:
        logger.info("Warming cache on startup...")

        # Warm agent cache
        agents = db.query(Agent).filter(Agent.is_active == True).all()
        agent_data = {}
        for agent in agents:
            agent_dict = {c.name: getattr(agent, c.name) for c in agent.__table__.columns}
            agent_data[str(agent.id)] = agent_dict
            # Also cache by name
            agent_data[agent.name] = agent_dict

        if agent_data:
            cache.mset("agents", agent_data, CacheTTL.AGENT_CONFIG)
            logger.info(f"Cached {len(agents)} agents")

        # Warm channel cache
        channels = db.query(Channel).filter(Channel.is_archived == False).all()
        channel_data = {}
        for channel in channels:
            channel_dict = {c.name: getattr(channel, c.name) for c in channel.__table__.columns}
            channel_data[str(channel.id)] = channel_dict

        if channel_data:
            cache.mset("channels", channel_data, CacheTTL.CHANNEL_METADATA)
            logger.info(f"Cached {len(channels)} channels")

        logger.info("Cache warming complete")

    except Exception as e:
        logger.error(f"Cache warming failed: {e}")
        # Non-fatal - application continues without warm cache
