# Streaming Tests

Tests for LLM streaming functionality (Issue #47).

## Test Files

### 1. `test_streaming.py`

**Purpose**: Unit tests for LLM client streaming across all providers

**Tests**:
- Anthropic Claude streaming
- OpenAI streaming
- Ollama streaming
- TTFB measurement

**Run**:
```bash
cd backend
python tests/test_streaming.py
```

**Expected Output**:
```
Testing Anthropic Claude Streaming
⚡ TTFB: 234ms (target: <500ms)
Code flows through circuits bright,
Bugs emerge, then vanish in light,
Logic's dance takes flight.
✅ Complete in 3421ms
Total characters: 156
```

### 2. `test_streaming_integration.py`

**Purpose**: Integration tests for full streaming stack

**Tests**:
- Agent-level streaming (`process_message_streaming`)
- WebSocket event emission
- End-to-end flow simulation

**Run**:
```bash
cd backend
python tests/test_streaming_integration.py
```

**Expected Output**:
```
Testing Agent Streaming
Agent: @backend-test
Provider: anthropic
Model: claude-3-5-sonnet-20241022

Prompt: 'Explain what FastAPI is in one sentence'
[TTFB: 312ms]FastAPI is a modern, fast web framework...
✅ Streaming complete!
   Chunks: 12
   Characters: 156
   Total time: 2341ms
```

## Prerequisites

### Environment Variables

Required for tests to run:

```bash
# .env
ANTHROPIC_API_KEY=sk-ant-...   # For Anthropic tests
OPENAI_API_KEY=sk-...          # For OpenAI tests
OLLAMA_HOST=http://localhost:11434  # For Ollama tests
```

### Dependencies

```bash
pip install anthropic openai httpx
```

## Test Scenarios

### Scenario 1: TTFB Measurement

Tests verify that Time-To-First-Byte is < 500ms:

```python
start = time.time()
async for chunk, is_final, _ in client.stream(...):
    if chunk and first_chunk is None:
        ttfb = (time.time() - start) * 1000
        assert ttfb < 500, f"TTFB {ttfb}ms exceeds 500ms target"
```

### Scenario 2: Chunk Accumulation

Tests verify chunks combine to form complete response:

```python
accumulated = ""
async for chunk, is_final, _ in client.stream(...):
    accumulated += chunk

assert len(accumulated) > 0
assert "FastAPI" in accumulated  # Verify content
```

### Scenario 3: Tool Call Extraction

Tests verify tool calls in final chunk:

```python
async for chunk, is_final, tool_calls in client.stream(...):
    if is_final and tool_calls:
        assert isinstance(tool_calls, list)
        assert tool_calls[0]["name"] == "read_file"
```

## Performance Targets

| Metric | Target | Anthropic | OpenAI | Ollama |
|--------|--------|-----------|--------|--------|
| TTFB | < 500ms | 100-300ms | 150-400ms | 50-200ms |
| Total Time | < 3s | 2-4s | 2-5s | 1-10s |

## Troubleshooting

### Test Fails: "ANTHROPIC_API_KEY not set"

**Solution**: Add API key to `.env`:
```bash
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env
```

### Test Fails: Connection timeout

**Causes**:
- No internet connection
- LLM provider API down
- Firewall blocking requests

**Solution**: Check network and provider status

### Test Skipped: Provider not configured

**Example**: "SKIPPED: OPENAI_API_KEY not set"

**Reason**: Test requires API key that's not configured

**Action**: Either:
1. Add API key to test provider
2. Or skip that provider (tests continue)

## Debugging

### Enable Verbose Logging

```bash
export LOG_LEVEL=DEBUG
python tests/test_streaming.py
```

### Check Streaming Events

```python
async for chunk, is_final, metadata in client.stream(...):
    print(f"Chunk: {repr(chunk)}")
    print(f"Is Final: {is_final}")
    print(f"Metadata: {metadata}")
```

### Measure Latency

```python
import time

start = time.time()
chunk_times = []

async for chunk, is_final, _ in client.stream(...):
    if chunk:
        chunk_time = (time.time() - start) * 1000
        chunk_times.append(chunk_time)
        print(f"Chunk at {chunk_time:.0f}ms")

print(f"Average latency: {sum(chunk_times) / len(chunk_times):.0f}ms")
```

## CI/CD Integration

### GitHub Actions

```yaml
- name: Test LLM Streaming
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
  run: |
    cd backend
    python tests/test_streaming.py
```

### Pytest Integration

```bash
# Run with pytest
pytest tests/test_streaming.py -v

# Run with coverage
pytest tests/test_streaming.py --cov=agents.llm_client
```

## Related Documentation

- `/backend/STREAMING_IMPLEMENTATION.md` - Full implementation guide
- `/backend/STREAMING_SUMMARY.md` - Quick reference
- Issue #47 - Performance optimization requirements
