# Redis Cache Implementation - Issue #47

## Overview

This document describes the Redis caching layer implemented to reduce database query load and improve API response times per Issue #47.

**Performance Target (NFR)**: 60%+ reduction in repeated database queries

## Architecture

### Cache Manager (`backend/core/cache.py`)

The `CacheManager` class provides a robust caching layer with:

- **JSON Serialization**: Automatic handling of complex Python objects (UUID, datetime, SQLAlchemy models)
- **TTL Support**: Configurable expiration times per data type
- **Namespace Isolation**: Organized cache keys (e.g., `reznet:agents:@orchestrator`)
- **Bulk Operations**: `mget()` and `mset()` for efficient batch operations
- **Metrics Tracking**: Hit/miss rates, operation counts, error tracking
- **Pattern Deletion**: Invalidate groups of related keys

### Cache TTL Strategy

Different data types have different cache lifetimes based on change frequency:

| Data Type | TTL | Rationale |
|-----------|-----|-----------|
| Agent Configs | 1 hour (3600s) | Agents rarely change after creation |
| Agent Lists | 30 minutes (1800s) | List composition changes infrequently |
| Channel Metadata | 10 minutes (600s) | Moderate change rate (messages, context clears) |
| Workflow Status | 1 minute (60s) | High change rate during execution |
| Message Counts | 5 minutes (300s) | Frequently updated statistics |

## Integration Points

### 1. Agents Router (`backend/routers/agents.py`)

**Cached Endpoints**:
- `GET /api/agents` - List all agents (30min TTL)
- `GET /api/agents/{agent_id}` - Get agent by ID (1hr TTL)
- `GET /api/agents/name/{agent_name}` - Get agent by name (1hr TTL)

**Cache Invalidation**:
- `PATCH /api/agents/{agent_id}/activate` - Invalidates agent + list cache
- `PATCH /api/agents/{agent_id}/deactivate` - Invalidates agent + list cache

### 2. Channels Router (`backend/routers/channels.py`)

**Cached Endpoints**:
- `GET /api/channels` - List all channels (10min TTL)
- `GET /api/channels/{channel_id}` - Get channel by ID (10min TTL)

**Cache Invalidation**:
- `POST /api/channels` - Invalidates channel list cache
- `DELETE /api/channels/{channel_id}` - Invalidates channel cache
- `POST /api/channels/{channel_id}/clear` - Invalidates channel cache (context changed)

### 3. Workflows Router (`backend/routers/workflows.py`)

**Cached Endpoints**:
- `GET /api/workflows/{workflow_id}` - Get workflow status (1min TTL)

**Cache Invalidation**:
- `POST /api/workflows/{workflow_id}/start` - Invalidates workflow cache
- `POST /api/workflows/{workflow_id}/cancel` - Invalidates workflow cache
- `DELETE /api/workflows/{workflow_id}` - Invalidates workflow cache

## Cache Warming

On application startup (`backend/main.py`), the cache is pre-populated with frequently accessed data:

```python
warm_cache_on_startup(db)
```

**Pre-loaded Data**:
- All active agents (5 default agents)
- All non-archived channels

This reduces cold start latency and ensures fast first requests.

## Monitoring & Metrics

### Cache Performance Endpoint

```bash
GET /api/performance/cache
```

**Response**:
```json
{
  "cache_metrics": {
    "hits": 1250,
    "misses": 150,
    "sets": 200,
    "deletes": 50,
    "errors": 0,
    "total_reads": 1400,
    "hit_rate_percent": 89.29,
    "redis_connected": true
  },
  "nfr_target": "60%+ cache hit rate for frequently accessed data",
  "recommendation": "Monitor hit_rate_percent - should be > 60% for optimal performance"
}
```

### Response Headers

All API requests include cache/query metrics in headers:

- `X-Process-Time`: Total request processing time (ms)
- `X-Query-Count`: Number of database queries executed
- `X-Query-Time`: Total database query time (ms)

## Usage Examples

### Manual Cache Operations

```python
from core.cache import cache, CacheTTL

# Set value in cache
agent_data = {"id": "123", "name": "@backend"}
cache.set("agents", "123", agent_data, CacheTTL.AGENT_CONFIG)

# Get value from cache
cached_agent = cache.get("agents", "123")

# Delete specific key
cache.delete("agents", "123")

# Delete all agent list cache
cache.delete_pattern("agents", "list:*")

# Bulk operations
agents = {
    "123": {"name": "@backend"},
    "456": {"name": "@frontend"}
}
cache.mset("agents", agents, CacheTTL.AGENT_CONFIG)
```

### Using the Decorator

```python
from core.cache import cached, CacheTTL

@cached(namespace="agents", ttl=CacheTTL.AGENT_CONFIG, key_param="agent_id")
async def get_expensive_agent_data(agent_id: UUID, db: Session):
    # This function will only execute on cache miss
    return db.query(Agent).filter(Agent.id == agent_id).first()
```

## Cache Invalidation Strategy

**Write-Through Pattern**: Update database first, then invalidate cache

```python
# Update database
agent.is_active = True
db.commit()

# Invalidate cache
cache.delete("agents", str(agent_id))
cache.delete("agents", agent.name)
cache.delete_pattern("agents", "list:*")  # Lists may include this agent
```

**Why Not Update Cache?**
- Avoid stale data from concurrent updates
- Simpler to reason about
- Next read will fetch fresh data
- Short TTLs minimize impact

## Performance Benchmarks

### Expected Results

With proper cache usage, you should see:

1. **Database Query Reduction**: 60-80% fewer queries for frequently accessed data
2. **Response Time Improvement**:
   - Cached requests: < 10ms
   - Uncached requests: 50-200ms
   - Cold start: 100-500ms (first request)
3. **Hit Rate**: > 60% for agent/channel reads after warm-up

### Monitoring Performance

```bash
# Watch cache metrics in real-time
watch -n 1 curl -s http://localhost:8000/api/performance/cache

# Check database query profiling
curl http://localhost:8000/api/performance/database
```

## Configuration

### Redis Connection

Set in `.env`:

```bash
REDIS_URL=redis://localhost:6379
```

### Cache Settings

Configured in `backend/core/config.py`:

```python
ENABLE_CACHE: bool = True
CACHE_TTL: int = 3600  # Default TTL (seconds)
```

## Error Handling

The cache layer is designed to **fail gracefully**:

- If Redis is unavailable, operations return `None`/`False` (no exceptions)
- API continues to work (falls back to database queries)
- Errors are logged but don't break the application

```python
# Example: Cache failure handling
cached_agent = cache.get("agents", agent_id)
if cached_agent is not None:
    return cached_agent  # Cache hit
else:
    # Cache miss or error - query database
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    cache.set("agents", str(agent_id), agent, CacheTTL.AGENT_CONFIG)
    return agent
```

## Testing

Run cache tests:

```bash
cd backend
pytest tests/test_cache.py -v
```

**Test Coverage**:
- Basic set/get operations
- TTL expiration
- Pattern-based deletion
- Bulk operations (mget/mset)
- Serialization of complex objects
- Namespace isolation
- Metrics tracking
- Performance benchmarks

## Troubleshooting

### Cache Not Working

1. **Check Redis connection**:
   ```bash
   docker ps | grep redis
   redis-cli ping  # Should return PONG
   ```

2. **Check cache metrics**:
   ```bash
   curl http://localhost:8000/api/performance/cache
   ```
   - `redis_connected: false` → Redis connection failed
   - `errors > 0` → Check logs for Redis errors

3. **Verify cache keys**:
   ```bash
   redis-cli
   > KEYS reznet:*
   > GET reznet:agents:@orchestrator
   ```

### Low Hit Rate

If hit rate < 60%:

1. **Check TTL values** - May be too short
2. **Verify cache warming** - Startup logs should show cache warming
3. **Monitor access patterns** - Are you querying different data each time?
4. **Check invalidation** - Are you over-invalidating?

### High Memory Usage

Redis memory monitoring:

```bash
redis-cli INFO memory
```

If memory is high:
- Lower TTL values
- Reduce number of cached items
- Implement LRU eviction policy
- Consider Redis maxmemory settings

## Future Enhancements

Potential improvements (not in scope for Issue #47):

1. **Cache Warming Intelligence**: Predict and pre-load frequently accessed data
2. **Cache Compression**: Reduce memory usage with compressed values
3. **Distributed Caching**: Redis Cluster for horizontal scaling
4. **Cache Stamping**: Prevent cache stampede during invalidation
5. **Write-Behind Cache**: Async write-through for high-throughput scenarios
6. **Cache Analytics**: Detailed access pattern analysis and recommendations

## References

- Issue #47: Performance Optimization - Redis Caching
- NFR Document: `/meta-dev/NFR.md` (lines 19-36, 94-116)
- Redis Documentation: https://redis.io/docs/
- FastAPI Caching Best Practices: https://fastapi.tiangolo.com/advanced/

---

**Implementation Date**: 2025-11-04
**Author**: Sam-DB (Backend Specialist)
**Status**: Production Ready
