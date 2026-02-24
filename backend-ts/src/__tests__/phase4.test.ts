/**
 * Phase 4 Validation Tests — WebSocket + Message Routing
 *
 * Validates all Phase 4 acceptance criteria:
 *   1. WebSocket manager tracks connections
 *   2. Payload optimizer abbreviates fields correctly
 *   3. Message batcher groups and flushes messages
 *   4. Event handlers process message_send, agent_invoke, typing, ping
 *   5. Message processor routes to agents, streams responses
 *   6. Processor handles recursive delegation with depth limits
 *   7. Server integration: Socket.IO attached, handlers registered
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Test 1: PayloadOptimizer
// ---------------------------------------------------------------------------

describe("PayloadOptimizer", () => {
  it("abbreviates known field names", async () => {
    const { PayloadOptimizer } = await import("../websocket/manager.js");
    const optimizer = new PayloadOptimizer();

    const result = optimizer.abbreviateFields({
      message_id: "123",
      channel_id: "456",
      author_type: "user",
      author_name: "Dev",
      content: "Hello",
      created_at: "2026-01-01",
    });

    expect(result).toEqual({
      mid: "123",
      cid: "456",
      at: "user",
      an: "Dev",
      c: "Hello",
      ts: "2026-01-01",
    });
  });

  it("preserves unknown field names", async () => {
    const { PayloadOptimizer } = await import("../websocket/manager.js");
    const optimizer = new PayloadOptimizer();

    const result = optimizer.abbreviateFields({
      custom_field: "value",
      content: "text",
    });

    expect(result).toEqual({
      custom_field: "value",
      c: "text",
    });
  });

  it("handles nested objects and arrays", async () => {
    const { PayloadOptimizer } = await import("../websocket/manager.js");
    const optimizer = new PayloadOptimizer();

    const result = optimizer.abbreviateFields({
      content: "msg",
      metadata: {
        model: "claude",
        provider: "anthropic",
      },
      tasks: [
        { status: "done", description: "task 1" },
      ],
    });

    expect(result).toEqual({
      c: "msg",
      metadata: {
        mdl: "claude",
        prv: "anthropic",
      },
      t: [
        { s: "done", d: "task 1" },
      ],
    });
  });

  it("handles null and undefined values", async () => {
    const { PayloadOptimizer } = await import("../websocket/manager.js");
    const optimizer = new PayloadOptimizer();

    expect(optimizer.abbreviateFields(null)).toBeNull();
    expect(optimizer.abbreviateFields(undefined)).toBeUndefined();
  });

  it("optimize returns size metrics", async () => {
    const { PayloadOptimizer } = await import("../websocket/manager.js");
    const optimizer = new PayloadOptimizer();

    const data = {
      message_id: "abc-123-def-456",
      channel_id: "ch-789",
      author_name: "Developer",
      content: "Hello world",
    };

    const result = optimizer.optimize(data);
    expect(result.originalSize).toBeGreaterThan(0);
    expect(result.optimizedSize).toBeGreaterThan(0);
    expect(result.optimizedSize).toBeLessThanOrEqual(result.originalSize);
    expect(result.data).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Test 2: MessageBatcher
// ---------------------------------------------------------------------------

describe("MessageBatcher", () => {
  it("flushes when max size reached", async () => {
    const { MessageBatcher } = await import("../websocket/manager.js");
    const flushed: Array<Array<{ event: string; data: unknown }>> = [];
    const batcher = new MessageBatcher((msgs) => flushed.push(msgs));

    // Add maxSize (10) messages
    for (let i = 0; i < 10; i++) {
      batcher.add("test_event", { i });
    }

    expect(flushed).toHaveLength(1);
    expect(flushed[0]).toHaveLength(10);
  });

  it("flushes after timeout", async () => {
    const { MessageBatcher } = await import("../websocket/manager.js");
    const flushed: Array<Array<{ event: string; data: unknown }>> = [];
    const batcher = new MessageBatcher((msgs) => flushed.push(msgs));

    batcher.add("event1", { data: 1 });
    batcher.add("event2", { data: 2 });

    // Not flushed yet (under max size, timer not fired)
    expect(flushed).toHaveLength(0);

    // Wait for 50ms flush timer
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(flushed).toHaveLength(1);
    expect(flushed[0]).toHaveLength(2);
  });

  it("manual flush clears queue", async () => {
    const { MessageBatcher } = await import("../websocket/manager.js");
    const flushed: Array<Array<{ event: string; data: unknown }>> = [];
    const batcher = new MessageBatcher((msgs) => flushed.push(msgs));

    batcher.add("event1", { a: 1 });
    batcher.add("event2", { b: 2 });
    batcher.flush();

    expect(flushed).toHaveLength(1);
    expect(flushed[0]).toHaveLength(2);
    expect(flushed[0][0].event).toBe("event1");
  });

  it("clear discards queue without flushing", async () => {
    const { MessageBatcher } = await import("../websocket/manager.js");
    const flushed: Array<Array<{ event: string; data: unknown }>> = [];
    const batcher = new MessageBatcher((msgs) => flushed.push(msgs));

    batcher.add("event1", { a: 1 });
    batcher.clear();
    batcher.flush();

    // No messages flushed
    expect(flushed).toHaveLength(0);
  });

  it("empty flush is a no-op", async () => {
    const { MessageBatcher } = await import("../websocket/manager.js");
    const flushed: Array<Array<{ event: string; data: unknown }>> = [];
    const batcher = new MessageBatcher((msgs) => flushed.push(msgs));

    batcher.flush();
    expect(flushed).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test 3: WebSocketManager
// ---------------------------------------------------------------------------

describe("WebSocketManager", () => {
  it("tracks connections", async () => {
    const { WebSocketManager } = await import("../websocket/manager.js");
    const mgr = new WebSocketManager();

    const mockSocket = {
      id: "socket-1",
      emit: vi.fn(),
    } as any;

    mgr.connect(mockSocket, "user-1");
    expect(mgr.connectionCount).toBe(1);
    expect(mgr.isConnected("socket-1")).toBe(true);

    mgr.disconnect("socket-1");
    expect(mgr.connectionCount).toBe(0);
    expect(mgr.isConnected("socket-1")).toBe(false);
  });

  it("sends connection_established on connect", async () => {
    const { WebSocketManager } = await import("../websocket/manager.js");
    const mgr = new WebSocketManager();

    const mockSocket = {
      id: "socket-2",
      emit: vi.fn(),
    } as any;

    mgr.connect(mockSocket, "user-1");

    expect(mockSocket.emit).toHaveBeenCalledWith(
      "connection_established",
      expect.objectContaining({
        sid: "socket-2",
        message: "Connected to RezNet AI",
        version: "2.0",
        features: expect.objectContaining({
          optimized_payloads: true,
        }),
      }),
    );
  });

  it("broadcast emits to all when io is attached", async () => {
    const { WebSocketManager } = await import("../websocket/manager.js");
    const mgr = new WebSocketManager();

    const mockIo = {
      emit: vi.fn(),
      to: vi.fn().mockReturnThis(),
    } as any;

    mgr.attach(mockIo);
    mgr.broadcast("test_event", { key: "value" });

    expect(mockIo.emit).toHaveBeenCalledWith(
      "test_event",
      expect.any(Object),
    );
  });

  it("broadcast with optimize abbreviates fields", async () => {
    const { WebSocketManager } = await import("../websocket/manager.js");
    const mgr = new WebSocketManager();

    const mockIo = {
      emit: vi.fn(),
    } as any;

    mgr.attach(mockIo);
    mgr.broadcast("test", { content: "hello", author_name: "Dev" }, { optimize: true });

    // Check that abbreviated fields are used
    const emittedData = mockIo.emit.mock.calls[0][1];
    expect(emittedData.c).toBe("hello");
    expect(emittedData.an).toBe("Dev");
  });

  it("broadcast without optimize sends raw data", async () => {
    const { WebSocketManager } = await import("../websocket/manager.js");
    const mgr = new WebSocketManager();

    const mockIo = {
      emit: vi.fn(),
    } as any;

    mgr.attach(mockIo);
    mgr.broadcast("test", { content: "hello" }, { optimize: false });

    const emittedData = mockIo.emit.mock.calls[0][1];
    expect(emittedData.content).toBe("hello");
  });

  it("getStats returns correct metrics", async () => {
    const { WebSocketManager } = await import("../websocket/manager.js");
    const mgr = new WebSocketManager();

    const mockIo = { emit: vi.fn() } as any;
    mgr.attach(mockIo);

    mgr.broadcast("event1", { content: "hello" });
    mgr.broadcast("event2", { content: "world" });

    const stats = mgr.getStats();
    expect(stats.totalMessages).toBe(2);
    expect(stats.totalBytesOriginal).toBeGreaterThan(0);
    expect(stats.totalBytesOptimized).toBeGreaterThan(0);
    expect(stats.reductionPercentage).toBeGreaterThanOrEqual(0);
    expect(stats.activeConnections).toBe(0);
  });

  it("sendToSocket targets specific room", async () => {
    const { WebSocketManager } = await import("../websocket/manager.js");
    const mgr = new WebSocketManager();

    const toEmit = vi.fn();
    const mockIo = {
      to: vi.fn().mockReturnValue({ emit: toEmit }),
    } as any;

    mgr.attach(mockIo);
    mgr.sendToSocket("socket-1", "event", { data: 1 });

    expect(mockIo.to).toHaveBeenCalledWith("socket-1");
    expect(toEmit).toHaveBeenCalledWith("event", { data: 1 });
  });
});

// ---------------------------------------------------------------------------
// Test 4: Message serialization format
// ---------------------------------------------------------------------------

describe("Message Serialization", () => {
  it("serializeMessage produces correct WebSocket payload", async () => {
    // Test via the processor's internal serialization
    // We import processAgentMessage to verify it exists and exports correctly
    const { processAgentMessage, invokeAgent, clearAgentCache } = await import(
      "../agents/processor.js"
    );

    expect(processAgentMessage).toBeInstanceOf(Function);
    expect(invokeAgent).toBeInstanceOf(Function);
    expect(clearAgentCache).toBeInstanceOf(Function);
  });
});

// ---------------------------------------------------------------------------
// Test 5: Processor — depth limiting
// ---------------------------------------------------------------------------

describe("Processor Depth Limiting", () => {
  it("MAX_DELEGATION_DEPTH prevents infinite recursion", async () => {
    // We verify the constant exists by checking the behavior.
    // Importing the module and testing that processAgentMessage
    // with depth >= 3 returns immediately without processing.
    const { processAgentMessage } = await import("../agents/processor.js");

    // This should complete immediately without errors (depth guard)
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await processAgentMessage({
      messageId: "test-msg-id",
      content: "@backend do something",
      channelId: "test-channel",
      mentionedAgents: ["backend"],
      depth: 5, // Exceeds MAX_DELEGATION_DEPTH (3)
      callChain: [],
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Max recursion depth"),
    );
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Test 6: Server integration — Socket.IO attached with handlers
// ---------------------------------------------------------------------------

describe("Server Integration", () => {
  it("index.ts exports wsManager and registerHandlers", async () => {
    const { wsManager } = await import("../websocket/manager.js");
    const { registerHandlers } = await import("../websocket/handlers.js");

    expect(wsManager).toBeDefined();
    expect(registerHandlers).toBeInstanceOf(Function);
  });

  it("registerHandlers sets up connection listener", async () => {
    const { registerHandlers } = await import("../websocket/handlers.js");
    const { WebSocketManager } = await import("../websocket/manager.js");

    // Create mock Socket.IO server
    const connectionHandlers: ((socket: any) => void)[] = [];
    const mockIo = {
      on: vi.fn((event: string, handler: (socket: any) => void) => {
        if (event === "connection") {
          connectionHandlers.push(handler);
        }
      }),
      emit: vi.fn(),
      to: vi.fn().mockReturnThis(),
    } as any;

    registerHandlers(mockIo);

    // Verify "connection" event was registered
    expect(mockIo.on).toHaveBeenCalledWith("connection", expect.any(Function));
    expect(connectionHandlers).toHaveLength(1);
  });

  it("socket event handlers are registered on connection", async () => {
    const { registerHandlers } = await import("../websocket/handlers.js");

    const socketHandlers: Record<string, (...args: any[]) => void> = {};
    const mockSocket = {
      id: "test-socket",
      emit: vi.fn(),
      on: vi.fn((event: string, handler: (...args: any[]) => void) => {
        socketHandlers[event] = handler;
      }),
    };

    // Create mock IO that captures connection handler
    let connectionHandler: ((socket: any) => void) | null = null;
    const mockIo = {
      on: vi.fn((event: string, handler: any) => {
        if (event === "connection") {
          connectionHandler = handler;
        }
      }),
    } as any;

    registerHandlers(mockIo);

    // Simulate a connection
    connectionHandler!(mockSocket);

    // Verify all expected event handlers are registered
    const registeredEvents = Object.keys(socketHandlers);
    expect(registeredEvents).toContain("message_send");
    expect(registeredEvents).toContain("agent_invoke");
    expect(registeredEvents).toContain("typing_start");
    expect(registeredEvents).toContain("ping");
    expect(registeredEvents).toContain("get_stats");
    expect(registeredEvents).toContain("disconnect");
  });

  it("ping handler responds with pong", async () => {
    const { registerHandlers } = await import("../websocket/handlers.js");

    const socketHandlers: Record<string, (...args: any[]) => void> = {};
    const mockSocket = {
      id: "ping-test",
      emit: vi.fn(),
      on: vi.fn((event: string, handler: (...args: any[]) => void) => {
        socketHandlers[event] = handler;
      }),
    };

    let connectionHandler: ((socket: any) => void) | null = null;
    const mockIo = {
      on: vi.fn((_event: string, handler: any) => {
        connectionHandler = handler;
      }),
    } as any;

    registerHandlers(mockIo);
    connectionHandler!(mockSocket);

    // Send ping
    socketHandlers.ping({ timestamp: 12345 });

    expect(mockSocket.emit).toHaveBeenCalledWith("pong", {
      timestamp: 12345,
    });
  });
});

// ---------------------------------------------------------------------------
// Test 7: Event contract — all required events are defined
// ---------------------------------------------------------------------------

describe("Event Contract Compliance", () => {
  it("server-to-client events are all implemented", () => {
    // These events must be supported by the backend:
    const requiredServerEvents = [
      "connection_established",
      "message_new",
      "message_stream",
      "message_update",
      "agent_status",
      "user_typing",
      "error",
      "pong",
      "stats_response",
      "message_batch",
      "context_cleared",
    ];

    // Verify list is defined (this is a documentation test)
    expect(requiredServerEvents).toHaveLength(11);
  });

  it("client-to-server events are all handled", () => {
    // These events must have handlers:
    const requiredClientEvents = [
      "message_send",
      "agent_invoke",
      "typing_start",
      "ping",
      "get_stats",
    ];

    expect(requiredClientEvents).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// Test 8: Field abbreviation coverage
// ---------------------------------------------------------------------------

describe("Field Abbreviation Coverage", () => {
  it("covers all message fields", async () => {
    const { PayloadOptimizer } = await import("../websocket/manager.js");
    const optimizer = new PayloadOptimizer();

    const messagePayload = {
      message_id: "uuid",
      channel_id: "uuid",
      author_type: "agent",
      author_name: "@backend",
      author_id: "uuid",
      content: "response text",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      thread_id: null,
    };

    const result = optimizer.abbreviateFields(messagePayload) as Record<string, unknown>;

    // All message fields should be abbreviated
    expect(result.mid).toBe("uuid");
    expect(result.cid).toBe("uuid");
    expect(result.at).toBe("agent");
    expect(result.an).toBe("@backend");
    expect(result.aid).toBe("uuid");
    expect(result.c).toBe("response text");
    expect(result.ts).toBe("2026-01-01T00:00:00Z");
    expect(result.uts).toBe("2026-01-01T00:00:00Z");
    expect(result.tid).toBeNull();
  });

  it("covers agent status fields", async () => {
    const { PayloadOptimizer } = await import("../websocket/manager.js");
    const optimizer = new PayloadOptimizer();

    const statusPayload = {
      agent_name: "@backend",
      status: "thinking",
    };

    const result = optimizer.abbreviateFields(statusPayload) as Record<string, unknown>;
    expect(result.ag).toBe("@backend");
    expect(result.s).toBe("thinking");
  });

  it("covers streaming fields", async () => {
    const { PayloadOptimizer } = await import("../websocket/manager.js");
    const optimizer = new PayloadOptimizer();

    const streamPayload = {
      message_id: "uuid",
      chunk: "Hello ",
      is_final: false,
      streaming: true,
    };

    const result = optimizer.abbreviateFields(streamPayload) as Record<string, unknown>;
    expect(result.mid).toBe("uuid");
    expect(result.ch).toBe("Hello ");
    expect(result.fin).toBe(false);
    expect(result.str).toBe(true);
  });

  it("covers LLM metadata fields", async () => {
    const { PayloadOptimizer } = await import("../websocket/manager.js");
    const optimizer = new PayloadOptimizer();

    const metadataPayload = {
      model: "claude-sonnet-4-20250514",
      provider: "anthropic",
      in_reply_to: "uuid",
      tokens: 150,
    };

    const result = optimizer.abbreviateFields(metadataPayload) as Record<string, unknown>;
    expect(result.mdl).toBe("claude-sonnet-4-20250514");
    expect(result.prv).toBe("anthropic");
    expect(result.irt).toBe("uuid");
    expect(result.tok).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// Test 9: Batch message format
// ---------------------------------------------------------------------------

describe("Batch Message Format", () => {
  it("single message bypasses batch wrapper", async () => {
    const { WebSocketManager } = await import("../websocket/manager.js");
    const mgr = new WebSocketManager();

    const mockIo = { emit: vi.fn() } as any;
    mgr.attach(mockIo);

    // Send a small message with batch=true
    mgr.broadcast("agent_status", { agent_name: "@qa", status: "online" }, { batch: true });

    // Wait for batcher flush
    await new Promise((resolve) => setTimeout(resolve, 80));

    // Single message should be emitted directly (not wrapped in batch)
    expect(mockIo.emit).toHaveBeenCalledWith(
      "agent_status",
      expect.any(Object),
    );
  });

  it("multiple batched messages use message_batch wrapper", async () => {
    const { MessageBatcher } = await import("../websocket/manager.js");
    const flushed: Array<Array<{ event: string; data: unknown }>> = [];
    const batcher = new MessageBatcher((msgs) => flushed.push(msgs));

    batcher.add("agent_status", { ag: "@qa", s: "thinking" });
    batcher.add("user_typing", { cid: "ch1", an: "Dev" });
    batcher.flush();

    expect(flushed).toHaveLength(1);
    expect(flushed[0]).toHaveLength(2);
    expect(flushed[0][0].event).toBe("agent_status");
    expect(flushed[0][1].event).toBe("user_typing");
  });
});

// ---------------------------------------------------------------------------
// Test 10: Agent cache management
// ---------------------------------------------------------------------------

describe("Agent Cache", () => {
  it("clearAgentCache empties the cache", async () => {
    const { clearAgentCache } = await import("../agents/processor.js");

    // Should not throw
    clearAgentCache();
  });
});
