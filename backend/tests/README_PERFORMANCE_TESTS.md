# Performance Test Suite - RezNet AI

> **Issue**: #47 - Performance Optimization
> **Owner**: Tron-QA (Quality Assurance Agent)
> **Status**: Test Suite Ready

---

## Overview

Comprehensive performance test suite validating NFR targets from `meta-dev/NFR.md`.

### Test Coverage

| Category | Tests | NFR Target | Status |
|----------|-------|------------|--------|
| **Agent Response Time** | 2 tests | < 3s (p95) | ✅ Ready |
| **Database Queries** | 2 tests | < 100ms (p95) | ✅ Ready |
| **Time to First Byte** | 2 tests | < 500ms | ✅ Ready |
| **Redis Cache** | 3 tests | 60%+ reduction | ✅ Ready |
| **API Endpoints** | 2 tests | < 200ms (p50), < 1s (p95) | ✅ Ready |
| **Streaming** | 1 test | Low latency | ✅ Ready |
| **Load Testing** | 1 script | 100 concurrent users | ✅ Ready |

**Total**: 13 performance tests + load testing script

---

## Quick Start

### Prerequisites

1. **Install dependencies**:
   ```bash
   cd backend
   source venv/bin/activate
   pip install -r requirements-dev.txt
   ```

2. **Start services**:
   ```bash
   # From project root
   docker-compose up -d  # PostgreSQL + Redis

   # Backend server (for load tests)
   cd backend
   source venv/bin/activate
   uvicorn main:app --reload
   ```

3. **Configure environment** (for LLM tests):
   ```bash
   # Add to backend/.env
   ANTHROPIC_API_KEY=your_key_here
   OPENAI_API_KEY=your_key_here  # Optional
   ```

### Run Tests

**Quick Test** (cache and API only, no LLM calls):
```bash
cd backend
./tests/run_performance_tests.sh --quick
```

**Standard Test** (includes LLM, skips load tests):
```bash
cd backend
./tests/run_performance_tests.sh
```

**Full Test** (everything including load tests):
```bash
cd backend
./tests/run_performance_tests.sh --full
```

**Load Test Only**:
```bash
cd backend
./tests/run_performance_tests.sh --load
```

**With Coverage**:
```bash
cd backend
./tests/run_performance_tests.sh --coverage
```

### Manual Test Execution

**Individual test classes**:
```bash
cd backend
source venv/bin/activate

# Cache performance
pytest tests/test_performance.py::TestCachePerformance -v

# Database queries
pytest tests/test_performance.py::TestDatabaseQueryPerformance -v

# API endpoints
pytest tests/test_performance.py::TestAPIEndpointPerformance -v

# Agent response time (requires API key)
pytest tests/test_performance.py::TestAgentResponseTime -v

# TTFB (requires API key)
pytest tests/test_performance.py::TestTimeToFirstByte -v

# Streaming (requires API key)
pytest tests/test_performance.py::TestStreamingPerformance -v
```

**Load tests**:
```bash
cd backend
source venv/bin/activate

# Standard load test (50 users, 60s)
python3 tests/load_test.py

# Custom configuration
python3 tests/load_test.py --users 100 --duration 120

# Stress test (2x load)
python3 tests/load_test.py --stress
```

---

## Test Suite Details

### 1. Agent Response Time Tests

**File**: `test_performance.py::TestAgentResponseTime`

**Tests**:
- `test_agent_response_time_simple_query` - Single query latency
- `test_agent_response_time_95th_percentile` - 10 requests, p95 calculation

**NFR Target**: < 3000ms (95th percentile)

**Requires**: `ANTHROPIC_API_KEY` environment variable

**What it validates**:
- Agent can respond within 3s for 95% of requests
- Statistical distribution of response times
- Consistency across multiple requests

**Example output**:
```
✓ Agent Response Time Statistics (10 requests):
  - Median (p50): 1523ms
  - 95th percentile: 2847ms
  - 99th percentile: 2951ms
  - Min: 1420ms
  - Max: 2998ms
```

---

### 2. Database Query Performance Tests

**File**: `test_performance.py::TestDatabaseQueryPerformance`

**Tests**:
- `test_agent_list_query_performance` - Agent list with caching
- `test_message_pagination_performance` - Message pagination

**NFR Target**: < 100ms (95th percentile)

**Requires**: Database fixtures (automatic)

**What it validates**:
- Database indexes are effective
- Query optimization works
- Pagination performs well
- Cache reduces query time

**Example output**:
```
✓ Agent List Query Performance (20 queries):
  - Median: 12.45ms
  - 95th percentile: 45.32ms
  - Min: 8.12ms
  - Max: 58.76ms
```

---

### 3. Time to First Byte (TTFB) Tests

**File**: `test_performance.py::TestTimeToFirstByte`

**Tests**:
- `test_anthropic_ttfb` - Anthropic streaming TTFB
- `test_openai_ttfb` - OpenAI streaming TTFB

**NFR Target**: < 500ms (average)

**Requires**: API keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`)

**What it validates**:
- LLM streaming starts quickly
- First chunk arrives within 500ms
- Provider comparison

**Example output**:
```
✓ Anthropic Streaming TTFB (5 requests):
  - Average: 342ms
  - Max: 456ms
  - Min: 287ms
```

---

### 4. Redis Cache Performance Tests

**File**: `test_performance.py::TestCachePerformance`

**Tests**:
- `test_cache_hit_rate_agents` - Cache effectiveness
- `test_cache_query_reduction` - Query reduction percentage
- `test_cache_set_get_performance` - Cache operation speed

**NFR Target**: 60%+ query reduction

**Requires**: Redis running (docker-compose)

**What it validates**:
- Cache hit rate is high after warmup
- Cache reduces database queries by 60%+
- Cache operations are fast (< 10ms)

**Example output**:
```
✓ Cache Performance:
  - Hits: 10
  - Misses: 1
  - Hit Rate: 90.9%

✓ Query Reduction:
  - Total requests: 100
  - DB queries: 1
  - Cache hits: 99
  - Query reduction: 99.0%

✓ Cache Operation Performance:
  - Average SET: 2.134ms
  - Average GET: 1.876ms
```

---

### 5. API Endpoint Performance Tests

**File**: `test_performance.py::TestAPIEndpointPerformance`

**Tests**:
- `test_health_check_performance` - Health endpoint
- `test_agent_list_endpoint_performance` - Agent list endpoint

**NFR Targets**:
- Median: < 200ms
- 95th percentile: < 1000ms

**Requires**: Database fixtures (automatic)

**What it validates**:
- API endpoints respond quickly
- Performance consistent across requests
- Caching improves response times

**Example output**:
```
✓ Agent List Endpoint (30 requests):
  - Median: 15.23ms
  - 95th percentile: 67.89ms
```

---

### 6. Streaming Performance Tests

**File**: `test_performance.py::TestStreamingPerformance`

**Tests**:
- `test_streaming_chunk_latency` - Inter-chunk latency

**NFR Target**: < 100ms average inter-chunk latency

**Requires**: `ANTHROPIC_API_KEY`

**What it validates**:
- Streaming chunks arrive smoothly
- Low latency between chunks
- Consistent streaming performance

**Example output**:
```
✓ Streaming Chunk Latency (43 chunks):
  - Average inter-chunk latency: 45.67ms
  - Max inter-chunk latency: 98.23ms
  - Total chunks: 43
```

---

### 7. Load Testing

**File**: `load_test.py`

**Capabilities**:
- Simulate N concurrent users
- Configurable test duration
- Ramp-up period to avoid spike
- Realistic user behavior patterns
- Comprehensive metrics

**NFR Target**: Support 100 concurrent users (Phase 2)

**Requires**: Backend server running

**Usage**:
```bash
# Standard load test
python3 tests/load_test.py --users 50 --duration 60

# Stress test
python3 tests/load_test.py --stress
```

**What it validates**:
- System handles concurrent load
- Response times remain acceptable under load
- Error rate stays low (< 5%)
- No crashes or timeouts
- Graceful degradation under stress

**Simulated user actions**:
1. Get agent list
2. Get channels
3. Send message
4. Get messages
5. Repeat with realistic delays

**Example output**:
```
========================================
LOAD TEST RESULTS
========================================

Requests:
  - Total requests: 2450
  - Successful: 2438
  - Failed: 12
  - Error rate: 0.49%
  - Throughput: 40.83 req/s

Response Times:
  - Median (p50): 45.23ms
  - 95th percentile: 234.56ms
  - 99th percentile: 456.78ms
  - Min: 12.34ms
  - Max: 567.89ms
  - Average: 78.90ms

NFR Validation:
  ✓ 95th percentile response time (234.56ms) < 1000ms
  ✓ Median response time (45.23ms) < 200ms
  ✓ Error rate (0.49%) < 5%
```

---

## NFR Validation Checklist

After running tests, validate against NFR requirements:

### Performance Targets

- [ ] **Agent Response Time**: p95 < 3s
- [ ] **Database Queries**: p95 < 100ms
- [ ] **TTFB**: < 500ms average
- [ ] **API Endpoints**: p50 < 200ms, p95 < 1s
- [ ] **Cache Hit Rate**: > 60% query reduction
- [ ] **Streaming**: Inter-chunk latency < 100ms
- [ ] **Concurrent Users**: Support 100 users (Phase 2 target)
- [ ] **Error Rate**: < 5% under load
- [ ] **Throughput**: Acceptable requests/second

### Quality Targets

- [ ] **Code Coverage**: > 80% (backend), > 70% (frontend)
- [ ] **Test Execution**: All tests pass
- [ ] **No Regressions**: Performance not degrading over time
- [ ] **Documentation**: Results documented in PERFORMANCE_TEST_RESULTS.md

---

## Troubleshooting

### Tests Failing

**"No module named X"**:
```bash
cd backend
source venv/bin/activate
pip install -r requirements.txt
pip install -r requirements-dev.txt
```

**"Redis connection failed"**:
```bash
# Start Redis
docker-compose up -d redis

# Verify Redis is running
redis-cli ping  # Should return PONG
```

**"ANTHROPIC_API_KEY not set"**:
```bash
# Add to backend/.env
echo "ANTHROPIC_API_KEY=your_key_here" >> .env

# Or skip LLM tests
pytest tests/test_performance.py -m performance -k "cache or endpoint"
```

**"Backend server not running"** (load tests):
```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload
```

### Tests Running Slow

**LLM tests take time** (API latency):
- Skip with: `pytest -m performance -k "not agent and not ttfb and not streaming"`
- Or use `--quick` mode: `./tests/run_performance_tests.sh --quick`

**Load tests take time** (by design):
- Reduce duration: `python3 tests/load_test.py --users 10 --duration 30`
- Skip with standard test mode (not `--full`)

### Tests Passing but Metrics Poor

1. **Check system resources**: High CPU/memory usage can affect results
2. **Network latency**: LLM API calls depend on network
3. **Database load**: Ensure PostgreSQL has sufficient resources
4. **Cache cold start**: First runs may be slower (warmup effect)
5. **Concurrent processes**: Close other applications during testing

---

## CI/CD Integration

### GitHub Actions (Future)

```yaml
name: Performance Tests

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  performance:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
      redis:
        image: redis:7

    steps:
      - uses: actions/checkout@v3

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.12'

      - name: Install dependencies
        run: |
          cd backend
          pip install -r requirements.txt
          pip install -r requirements-dev.txt

      - name: Run performance tests
        run: |
          cd backend
          pytest tests/test_performance.py -m performance -v
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          DATABASE_URL: postgresql://postgres:postgres@localhost/reznet_test
          REDIS_URL: redis://localhost:6379

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./backend/coverage.xml
```

---

## Performance Regression Detection

Track performance metrics over time:

1. **Baseline Metrics**: Record initial test results
2. **Regular Testing**: Run tests on every PR/commit
3. **Compare Results**: Detect regressions (e.g., p95 > 10% slower)
4. **Alert on Failures**: CI fails if NFR targets not met
5. **Historical Tracking**: Store results in database or time-series DB

**Example tracking**:
```
Commit    | Agent p95 | DB p95 | TTFB | API p50 | Cache Hit
-------------------------------------------------------------
abc123    | 2.4s      | 45ms   | 340ms| 25ms    | 92%
def456    | 2.6s ⚠️   | 43ms   | 350ms| 23ms    | 93%
ghi789    | 3.2s ❌   | 48ms   | 380ms| 28ms    | 89%
```

---

## References

- **NFR Document**: `/meta-dev/NFR.md`
- **Issue #47**: Performance Optimization
- **Test Results**: `/backend/tests/PERFORMANCE_TEST_RESULTS.md`
- **Test Suite**: `/backend/tests/test_performance.py`
- **Load Test**: `/backend/tests/load_test.py`
- **Run Script**: `/backend/tests/run_performance_tests.sh`

---

## Next Steps

1. **Run Initial Tests**:
   ```bash
   cd backend
   ./tests/run_performance_tests.sh --full
   ```

2. **Document Results**:
   - Update `PERFORMANCE_TEST_RESULTS.md` with actual metrics
   - Compare against NFR targets
   - Identify failing tests

3. **Optimize as Needed**:
   - Profile slow operations
   - Tune database queries
   - Adjust cache TTLs
   - Optimize LLM prompts

4. **Continuous Monitoring**:
   - Set up CI/CD integration
   - Track metrics over time
   - Alert on regressions
   - Regular performance reviews

---

**Created**: 2025-11-04
**Owner**: Tron-QA (Quality Assurance Agent)
**Status**: ✅ Test Suite Ready for Execution
