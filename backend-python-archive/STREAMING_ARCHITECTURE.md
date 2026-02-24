# LLM Streaming Architecture

**Visual guide to the streaming implementation for Issue #47**

---

## System Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                           USER INTERFACE                            │
│  (Frontend - React/Next.js - Pending Integration)                   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             │ WebSocket (Socket.IO)
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      WEBSOCKET MANAGER                               │
│  websocket/manager.py                                                │
│                                                                      │
│  Events:                                                             │
│  • message_new (placeholder)                                         │
│  • message_stream (chunks) ◄── Real-time streaming                  │
│  • message_update (final)                                            │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             │ Async function call
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      MESSAGE PROCESSOR                               │
│  agents/processor.py                                                 │
│                                                                      │
│  process_agent_message():                                            │
│  1. Create placeholder message (DB)                                  │
│  2. Emit message_new event                                           │
│  3. Call agent.process_message_streaming() ──────┐                  │
│  4. For each chunk:                               │                  │
│     - Emit message_stream event                   │                  │
│     - Accumulate response                         │                  │
│  5. Update DB with final response                 │                  │
│  6. Emit message_update event                     │                  │
└───────────────────────────────────────────────────┼──────────────────┘
                                                    │
                                                    │
                                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         BASE AGENT                                   │
│  agents/base.py                                                      │
│                                                                      │
│  process_message_streaming():                                        │
│  1. Build prompt with context                                        │
│  2. Get tool schemas (if enabled)                                    │
│  3. Call llm.stream() ──────────────────────────┐                   │
│  4. For each chunk:                              │                   │
│     - Yield (chunk, is_final, metadata)          │                   │
│     - Call optional callback                     │                   │
│  5. Execute tool calls (after streaming)         │                   │
│  6. Yield tool results                           │                   │
└──────────────────────────────────────────────────┼──────────────────┘
                                                    │
                                                    │
                                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         LLM CLIENT                                   │
│  agents/llm_client.py                                                │
│                                                                      │
│  stream():                                                           │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ Provider Router                                              │    │
│  │  if anthropic → _stream_anthropic()                          │    │
│  │  if openai    → _stream_openai()                             │    │
│  │  if ollama    → _stream_ollama()                             │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Each yields: (text_chunk, is_final, tool_calls)                    │
└────────────────────────────┬─────────────┬──────────────┬───────────┘
                             │             │              │
                             │             │              │
                             ▼             ▼              ▼
┌──────────────────┐  ┌──────────────┐  ┌──────────────────────┐
│   ANTHROPIC      │  │   OPENAI     │  │      OLLAMA          │
│   messages.      │  │   chat.      │  │   /api/generate      │
│   stream()       │  │   completions│  │   stream=true        │
│                  │  │   stream=true│  │                      │
│   TTFB:          │  │              │  │   TTFB:              │
│   100-300ms      │  │   TTFB:      │  │   50-200ms           │
│                  │  │   150-400ms  │  │   (local)            │
└──────────────────┘  └──────────────┘  └──────────────────────┘
```

---

## Event Timeline

```
Time: 0ms
│
│ User sends message: "@backend explain FastAPI"
│
▼ Message saved to DB
│
├─► Event: message_new
│   {
│     id: "msg-123",
│     content: "",
│     metadata: {streaming: true}
│   }
│
│ Agent instance created
│ Prompt built with context
│
Time: 100-400ms (TTFB) ◄── KEY METRIC
│
├─► Event: message_stream (chunk 1)
│   {
│     message_id: "msg-123",
│     chunk: "FastAPI",
│     is_final: false
│   }
│
│
├─► Event: message_stream (chunk 2)
│   {
│     message_id: "msg-123",
│     chunk: " is a",
│     is_final: false
│   }
│
│ ... (more chunks) ...
│
│
├─► Event: message_stream (chunk N)
│   {
│     message_id: "msg-123",
│     chunk: " framework.",
│     is_final: true,
│     metadata: {tool_calls: null}
│   }
│
│ Tool calls executed (if any)
│
│
├─► Event: message_stream (tool results)
│   {
│     message_id: "msg-123",
│     chunk: "\n\n✓ Read file: ...",
│     is_final: true
│   }
│
│ DB updated with complete response
│
│
├─► Event: message_update
│   {
│     id: "msg-123",
│     content: "FastAPI is a modern web framework...",
│     metadata: {streaming: false}
│   }
│
│ Agent marked as available
│
▼ Agent status: online
Time: 2000-4000ms (total)
```

---

## Data Flow

### 1. LLM Provider → LLM Client

```python
# Anthropic
async with client.messages.stream(...) as stream:
    async for event in stream:
        if event.type == 'content_block_delta':
            yield (event.delta.text, False, None)
            #     ▲               ▲      ▲
            #     │               │      └─ tool_calls
            #     │               └──────── is_final
            #     └──────────────────────── text_chunk
```

### 2. LLM Client → Agent

```python
async for chunk, is_final, tool_calls in self.llm.stream(...):
    accumulated_response += chunk

    yield (chunk, is_final, {"tool_calls": tool_calls})
    #     ▲      ▲           ▲
    #     │      │           └─ metadata dict
    #     │      └───────────── is_final flag
    #     └──────────────────── text chunk
```

### 3. Agent → Processor

```python
async for chunk, is_final, metadata in agent.process_message_streaming(...):
    accumulated_response += chunk

    await manager.broadcast('message_stream', {
        'message_id': str(message_id),
        'chunk': chunk,
        'is_final': is_final,
        'metadata': metadata
    })
```

### 4. Processor → WebSocket → Frontend

```javascript
socket.on('message_stream', (data) => {
    const { message_id, chunk, is_final } = data;

    // Append chunk to message in UI
    appendToMessage(message_id, chunk);

    if (is_final) {
        markMessageComplete(message_id);
    }
});
```

---

## Provider-Specific Streaming

### Anthropic Claude

```
Request
   │
   ▼
messages.stream(model="claude-3-5-sonnet", ...)
   │
   ├─► event: content_block_start
   │
   ├─► event: content_block_delta { delta: { text: "FastAPI" } }
   │   └─► YIELD ("FastAPI", False, None)
   │
   ├─► event: content_block_delta { delta: { text: " is" } }
   │   └─► YIELD (" is", False, None)
   │
   ├─► event: content_block_stop
   │
   ├─► event: message_stop
   │
   ▼
get_final_message()
   │
   └─► Extract tool_calls
       └─► YIELD ("", True, tool_calls)
```

### OpenAI

```
Request
   │
   ▼
chat.completions.create(stream=True, ...)
   │
   ├─► chunk 1: { delta: { content: "FastAPI" } }
   │   └─► YIELD ("FastAPI", False, None)
   │
   ├─► chunk 2: { delta: { content: " is" } }
   │   └─► YIELD (" is", False, None)
   │
   ├─► chunk N: { delta: { tool_calls: [...] } }
   │   └─► Accumulate tool call data
   │
   ├─► final chunk: { finish_reason: "stop" }
   │
   ▼
Parse accumulated tool calls
   │
   └─► YIELD ("", True, tool_calls)
```

### Ollama

```
Request
   │
   ▼
POST /api/generate { stream: true }
   │
   ├─► line 1: { "response": "FastAPI", "done": false }
   │   └─► YIELD ("FastAPI", False, None)
   │
   ├─► line 2: { "response": " is", "done": false }
   │   └─► YIELD (" is", False, None)
   │
   ├─► line N: { "response": ".", "done": true }
   │   └─► YIELD (".", True, None)
   │
   ▼
No native tool calling
   │
   └─► YIELD ("", True, None)
```

---

## Error Handling Flow

```
LLM Streaming Error
   │
   ├─► Exception caught in _stream_*()
   │   │
   │   ├─► Log error
   │   │
   │   └─► Raise exception
   │
   ▼
Agent Streaming Error
   │
   ├─► Exception caught in process_message_streaming()
   │   │
   │   ├─► Log error
   │   │
   │   ├─► Call callback with error (if provided)
   │   │
   │   └─► YIELD (error_msg, True, {"error": str(e)})
   │
   ▼
Processor Error Handling
   │
   ├─► Partial response accumulated
   │
   ├─► Emit message_stream with error metadata
   │
   ├─► Update DB with partial response
   │
   ├─► Mark agent as available
   │
   └─► Emit agent_status: online
```

---

## Database Schema Changes

**No schema changes required!** ✅

Existing `messages` table works with streaming:

```python
# Placeholder message (before streaming)
Message(
    id=uuid4(),
    channel_id=channel_id,
    author_id=agent_id,
    content="",  # Empty initially
    metadata={
        'streaming': True,  # Flag to indicate streaming in progress
        'provider': 'anthropic',
        'model': 'claude-3-5-sonnet-20241022'
    }
)

# Final message (after streaming)
Message(
    id=uuid4(),  # Same ID
    content="FastAPI is a modern web framework...",  # Complete response
    metadata={
        'streaming': False,  # Streaming complete
        'provider': 'anthropic',
        'model': 'claude-3-5-sonnet-20241022'
    }
)
```

---

## Performance Metrics

### Time to First Byte (TTFB)

```
┌─────────────────────────────────────────────────┐
│ Provider Comparison (TTFB)                      │
├─────────────────────────────────────────────────┤
│                                                 │
│ Anthropic  ████░░░░░░░  100-300ms               │
│ OpenAI     █████░░░░░░  150-400ms               │
│ Ollama     ██░░░░░░░░░   50-200ms (local)       │
│                                                 │
│ Target: < 500ms ✅                              │
└─────────────────────────────────────────────────┘
    0ms              250ms            500ms
```

### Total Response Time

```
┌─────────────────────────────────────────────────┐
│ Before Streaming (Non-streaming)                │
├─────────────────────────────────────────────────┤
│                                                 │
│ [██████████████████████████] 3000-5000ms        │
│                                                 │
│ User Experience: Long wait, no feedback         │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ After Streaming (Real-time)                     │
├─────────────────────────────────────────────────┤
│                                                 │
│ TTFB [█] 100-400ms                              │
│      ▼                                          │
│ [██████████████████████████] 2000-4000ms        │
│ ▲                          ▲                    │
│ │                          └─ Final chunk       │
│ └─ First chunk (FAST!)                          │
│                                                 │
│ User Experience: Immediate feedback, typing     │
└─────────────────────────────────────────────────┘
```

---

## Tool Call Integration

```
Streaming Phase
   │
   ├─► Chunk 1: "Let me read"
   ├─► Chunk 2: " that file"
   ├─► Chunk 3: " for you."
   │
   ▼ is_final=True
   │
Tool Extraction Phase
   │
   ├─► Anthropic/OpenAI: tool_calls from final chunk
   │   └─► [{name: "read_file", input: {path: "/app/main.py"}}]
   │
   ├─► Ollama: XML parsing from accumulated text
   │   └─► Parse: <tool_call name="read_file">...</tool_call>
   │
   ▼
Tool Execution Phase
   │
   ├─► Execute: read_file({path: "/app/main.py"})
   │   └─► Result: {success: true, content: "..."}
   │
   ├─► Format: "✓ Read file: /app/main.py"
   │
   └─► YIELD ("\n\n✓ Read file: /app/main.py", True, {...})
```

---

## WebSocket Event Schema

### message_stream

```typescript
{
  message_id: string;        // UUID of message being streamed
  chunk: string;             // Text chunk (incremental)
  is_final: boolean;         // True if last chunk
  metadata: {
    tool_calls?: ToolCall[]; // Only present in final chunk
    error?: string;          // If streaming failed
  }
}
```

### message_new

```typescript
{
  id: string;                // Message UUID
  channel_id: string;
  author_type: "agent";
  author_name: string;       // "@backend", "@frontend", etc.
  content: string;           // "" (empty if streaming)
  created_at: string;        // ISO timestamp
  metadata: {
    streaming: boolean;      // True if this is a streaming message
    model: string;
    provider: string;
    in_reply_to?: string;
  }
}
```

### message_update

```typescript
{
  id: string;                // Same as message_new
  channel_id: string;
  author_type: "agent";
  author_name: string;
  content: string;           // Complete final response
  created_at: string;
  metadata: {
    streaming: false;        // Always false (streaming complete)
    model: string;
    provider: string;
  }
}
```

---

## Sequence Diagram

```
User     Frontend    WebSocket    Processor    Agent      LLMClient   Provider
  │          │           │            │           │            │          │
  ├──────────►           │            │           │            │          │
  │ "explain            │            │           │            │          │
  │  FastAPI"           │            │           │            │          │
  │          │           │            │           │            │          │
  │          ├───────────►           │           │            │          │
  │          │ message_send          │           │            │          │
  │          │           │            │           │            │          │
  │          │           ├────────────►          │            │          │
  │          │           │  process_agent_msg    │            │          │
  │          │           │            │           │            │          │
  │          │           │            ├───────────►           │          │
  │          │           │            │ process_message_stream │          │
  │          │           │            │           │            │          │
  │          │           │            │           ├────────────►         │
  │          │           │            │           │  stream()  │          │
  │          │           │            │           │            │          │
  │          │           │            │           │            ├──────────►
  │          │           │            │           │            │  API call│
  │          │           │            │           │            │          │
  │          │           │            │           │            ◄──────────┤
  │          │           │            │           │            │ chunk 1  │
  │          │           │            │           ◄────────────┤          │
  │          │           │            │           │ chunk 1    │          │
  │          │           │            ◄───────────┤            │          │
  │          │           │            │ chunk 1   │            │          │
  │          │           ◄────────────┤           │            │          │
  │          │           │ message_stream         │            │          │
  │          ◄───────────┤            │           │            │          │
  │ Display   │           │            │           │            │          │
  │ "FastAPI" │           │            │           │            │          │
  │          │           │            │           │            ◄──────────┤
  │          │           │            │           │            │ chunk 2  │
  │          │           │            │           ◄────────────┤          │
  │          │           │            ◄───────────┤            │          │
  │          │           ◄────────────┤           │            │          │
  │          ◄───────────┤            │           │            │          │
  │ Append    │           │            │           │            │          │
  │ " is a"   │           │            │           │            │          │
  │          │           │            │           │            │          │
  │   ... (more chunks) ...           │           │            │          │
  │          │           │            │           │            │          │
  │          │           │            │           │            ◄──────────┤
  │          │           │            │           │            │ final    │
  │          │           │            │           ◄────────────┤          │
  │          │           │            ◄───────────┤ is_final=True         │
  │          │           ◄────────────┤           │            │          │
  │          ◄───────────┤            │           │            │          │
  │ Complete  │           │            │           │            │          │
  │          │           │            │           │            │          │
  │          │           ◄────────────┤           │            │          │
  │          │           │ message_update         │            │          │
  │          ◄───────────┤            │           │            │          │
  │ Final     │           │            │           │            │          │
  │ update    │           │            │           │            │          │
```

---

**Documentation**: Complete streaming architecture for Issue #47
**Status**: Backend implementation complete, ready for frontend integration
**Date**: 2025-11-04
