/**
 * RezNet Agent — wrapper around pi-agent-core's Agent class.
 *
 * Replaces backend/agents/base.py (560 LOC) + base_with_memory.py (260 LOC).
 *
 * Key responsibilities:
 *   - Wraps pi-agent-core Agent with RezNet-specific persona/system prompt
 *   - Provides processMessage() with context building (matches Python pattern)
 *   - Integrates tools (filesystem, delegation) via pi-agent-core's tool system
 *   - Memory injection via transformContext hook (Phase 6 — stubbed for now)
 *   - Status tracking (online, thinking, working, error)
 *   - Task execution wrapper for workflow integration
 */

import { Agent } from "@mariozechner/pi-agent-core";
import type {
  AgentEvent,
  AgentTool,
  AgentMessage,
} from "@mariozechner/pi-agent-core";
import type { Model, Api } from "@mariozechner/pi-ai";
// settings will be used in Phase 6 for memory configuration

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentStatus = "online" | "thinking" | "working" | "error";

export interface AgentPersona {
  role: string;
  goal: string;
  backstory: string;
  capabilities: string[];
  color: string;
}

export interface RezNetAgentOptions {
  /** Database UUID for this agent. */
  agentId: string;
  /** Display name (e.g., "backend"). */
  name: string;
  /** Type slug: orchestrator, backend, frontend, qa, devops. */
  agentType: string;
  /** Persona definition. */
  persona: AgentPersona;
  /** pi-ai model instance. */
  model: Model<Api>;
  /** Tools available to this agent. */
  tools?: AgentTool[];
  /** Optional config overrides. */
  config?: Record<string, unknown>;
}

export interface ProcessMessageContext {
  /** Recent conversation messages for context. */
  conversationHistory?: Array<{ role: string; content: string; author?: string }>;
  /** Outputs from previous workflow tasks. */
  previousTaskOutputs?: Array<{ agent: string; output: string }>;
  /** Relevant file contents. */
  files?: Array<{ path: string; content: string }>;
  /** Project information. */
  projectInfo?: string;
  /** Workspace instructions. */
  workspaceInstructions?: string;
  /** Workflow context. */
  workflowRequest?: string;
  /** Channel ID for memory retrieval. */
  channelId?: string;
  /** Relevant memories (injected by memory manager, Phase 6). */
  relevantMemories?: Array<{ content: string; relevanceScore: number }>;
  /** Context summary from memory (Phase 6). */
  contextSummary?: string;
}

export interface TaskResult {
  output: string;
  status: "completed" | "failed";
  agent: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

function buildSystemPrompt(persona: AgentPersona, _agentType: string): string {
  const capabilities = persona.capabilities
    .map((c) => `- ${c}`)
    .join("\n");

  return `You are ${persona.role}.

Your goal: ${persona.goal}

Background: ${persona.backstory}

Your key capabilities:
${capabilities}

Guidelines:
- Be professional, clear, and concise
- Provide actionable responses
- If you need more information, ask clarifying questions
- Admit when you don't know something
- Focus on your area of expertise
- Collaborate with other agents when needed (@backend, @frontend, @qa, @devops)

Task Execution Protocol:
- You work on ONE task at a time
- After completing a task, clearly indicate completion
- If you need another agent's help, mention them directly: "@backend can you..."
- Report your progress and any blockers

Remember: You are part of a team of AI agents working together on software development tasks.
When you mention another agent (like @backend), they will be automatically notified and can respond.`;
}

// ---------------------------------------------------------------------------
// Context prompt builder
// ---------------------------------------------------------------------------

function buildContextPrompt(
  message: string,
  context?: ProcessMessageContext,
): string {
  const parts: string[] = [];

  if (context?.workspaceInstructions) {
    parts.push(`## Workspace Instructions\n${context.workspaceInstructions}`);
  }

  if (context?.contextSummary) {
    parts.push(`## Context Summary\n${context.contextSummary}`);
  }

  if (context?.conversationHistory && context.conversationHistory.length > 0) {
    const history = context.conversationHistory
      .slice(-10)
      .map((m) => {
        const author = m.author ?? m.role;
        const truncated = m.content.length > 150 ? m.content.slice(0, 150) + "..." : m.content;
        return `${author}: ${truncated}`;
      })
      .join("\n");
    parts.push(`## Recent Conversation\n${history}`);
  }

  if (context?.relevantMemories && context.relevantMemories.length > 0) {
    const memories = context.relevantMemories
      .map((m) => {
        const truncated = m.content.length > 150 ? m.content.slice(0, 150) + "..." : m.content;
        return `- [relevance: ${m.relevanceScore.toFixed(2)}] ${truncated}`;
      })
      .join("\n");
    parts.push(`## Relevant Memories\n${memories}`);
  }

  if (context?.previousTaskOutputs && context.previousTaskOutputs.length > 0) {
    const outputs = context.previousTaskOutputs
      .map((t) => `### ${t.agent}\n${t.output}`)
      .join("\n\n");
    parts.push(`## Previous Task Outputs\n${outputs}`);
  }

  if (context?.files && context.files.length > 0) {
    const fileContents = context.files
      .map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
      .join("\n\n");
    parts.push(`## Relevant Files\n${fileContents}`);
  }

  if (context?.projectInfo) {
    parts.push(`## Project Info\n${context.projectInfo}`);
  }

  if (context?.workflowRequest) {
    parts.push(`## Workflow Request\n${context.workflowRequest}`);
  }

  parts.push(`## YOUR TASK\n${message}`);

  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// RezNetAgent class
// ---------------------------------------------------------------------------

export class RezNetAgent {
  readonly agentId: string;
  readonly name: string;
  readonly agentType: string;
  readonly persona: AgentPersona;
  private readonly piAgent: Agent;

  private _status: AgentStatus = "online";
  private _currentTask: string | null = null;

  constructor(opts: RezNetAgentOptions) {
    this.agentId = opts.agentId;
    this.name = opts.name;
    this.agentType = opts.agentType;
    this.persona = opts.persona;

    const systemPrompt = buildSystemPrompt(opts.persona, opts.agentType);

    this.piAgent = new Agent({
      initialState: {
        systemPrompt,
        model: opts.model,
        tools: opts.tools ?? [],
        thinkingLevel: "off",
      },
      // Memory injection hook — Phase 6 will replace this with actual retrieval
      transformContext: async (messages) => {
        // For now, pass through unchanged.
        // Phase 6 will inject relevant memories here.
        return messages;
      },
    });
  }

  // -------------------------------------------------------------------------
  // Status
  // -------------------------------------------------------------------------

  get status(): AgentStatus {
    return this._status;
  }

  get currentTask(): string | null {
    return this._currentTask;
  }

  getStatus(): {
    agentId: string;
    name: string;
    type: string;
    status: AgentStatus;
    currentTask: string | null;
  } {
    return {
      agentId: this.agentId,
      name: this.name,
      type: this.agentType,
      status: this._status,
      currentTask: this._currentTask,
    };
  }

  // -------------------------------------------------------------------------
  // Core: processMessage
  // -------------------------------------------------------------------------

  /**
   * Process a user message with optional context.
   *
   * Mirrors Python BaseAgent.process_message(message, context).
   * Returns the agent's text response.
   */
  async processMessage(
    message: string,
    context?: ProcessMessageContext,
  ): Promise<string> {
    this._status = "thinking";
    this._currentTask = message.slice(0, 100);

    try {
      // Build the full prompt with context
      const fullPrompt = buildContextPrompt(message, context);

      // Clear previous messages and send new prompt
      this.piAgent.clearMessages();
      await this.piAgent.prompt(fullPrompt);
      await this.piAgent.waitForIdle();

      // Extract response text from the agent's messages
      const response = this.extractResponseText();

      this._status = "online";
      this._currentTask = null;
      return response;
    } catch (err) {
      this._status = "error";
      this._currentTask = null;
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Streaming: processMessageStreaming
  // -------------------------------------------------------------------------

  /**
   * Process a message with streaming events.
   *
   * Returns a cleanup function. Subscribe to events before calling.
   */
  async processMessageStreaming(
    message: string,
    context?: ProcessMessageContext,
    onEvent?: (event: AgentEvent) => void,
  ): Promise<string> {
    this._status = "thinking";
    this._currentTask = message.slice(0, 100);

    let unsubscribe: (() => void) | undefined;

    try {
      if (onEvent) {
        unsubscribe = this.piAgent.subscribe(onEvent);
      }

      const fullPrompt = buildContextPrompt(message, context);
      this.piAgent.clearMessages();
      await this.piAgent.prompt(fullPrompt);
      await this.piAgent.waitForIdle();

      const response = this.extractResponseText();

      this._status = "online";
      this._currentTask = null;
      return response;
    } catch (err) {
      this._status = "error";
      this._currentTask = null;
      throw err;
    } finally {
      unsubscribe?.();
    }
  }

  // -------------------------------------------------------------------------
  // Task execution (workflow integration)
  // -------------------------------------------------------------------------

  /**
   * Execute a task and return a structured result.
   *
   * Mirrors Python BaseAgent.execute_task(description, context).
   */
  async executeTask(
    taskDescription: string,
    context?: ProcessMessageContext,
  ): Promise<TaskResult> {
    this._status = "working";
    this._currentTask = taskDescription.slice(0, 100);

    try {
      const output = await this.processMessage(taskDescription, context);
      return {
        output,
        status: "completed",
        agent: this.name,
      };
    } catch (err) {
      return {
        output: "",
        status: "failed",
        agent: this.name,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      this._status = "online";
      this._currentTask = null;
    }
  }

  // -------------------------------------------------------------------------
  // Event subscription (passthrough to pi-agent-core)
  // -------------------------------------------------------------------------

  /**
   * Subscribe to agent events (streaming, tool execution, etc.).
   * Returns unsubscribe function.
   */
  subscribe(fn: (event: AgentEvent) => void): () => void {
    return this.piAgent.subscribe(fn);
  }

  // -------------------------------------------------------------------------
  // Agent state access
  // -------------------------------------------------------------------------

  /** Get the underlying pi-agent-core Agent (for advanced use). */
  get agent(): Agent {
    return this.piAgent;
  }

  /** Update the system prompt. */
  setSystemPrompt(prompt: string): void {
    this.piAgent.setSystemPrompt(prompt);
  }

  /** Update the model. */
  setModel(model: Model<Api>): void {
    this.piAgent.setModel(model);
  }

  /** Update tools. */
  setTools(tools: AgentTool[]): void {
    this.piAgent.setTools(tools);
  }

  /** Abort current processing. */
  abort(): void {
    this.piAgent.abort();
  }

  /** Reset agent state. */
  reset(): void {
    this.piAgent.reset();
    this._status = "online";
    this._currentTask = null;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Extract the final text response from the agent's message history.
   * Throws if the LLM returned an error (e.g., invalid API key).
   */
  private extractResponseText(): string {
    const messages = this.piAgent.state.messages;
    const textParts: string[] = [];

    // Walk backwards to find the last assistant message(s)
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i] as AgentMessage;
      if (msg.role === "assistant") {
        // Detect pi-ai silent errors (invalid API key, rate limit, etc.)
        const anyMsg = msg as unknown as Record<string, unknown>;
        if (anyMsg.stopReason === "error") {
          throw new Error(
            `LLM API error (provider may have returned an error). ` +
            `Check your API key and provider configuration.`
          );
        }

        // Extract text content blocks
        if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (typeof block === "object" && "type" in block && block.type === "text" && "text" in block) {
              textParts.unshift(block.text as string);
            }
          }
        } else if (typeof msg.content === "string") {
          textParts.unshift(msg.content);
        }
        break; // Only get the last assistant message
      }
    }

    return textParts.join("") || "(No response)";
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { buildSystemPrompt, buildContextPrompt };
export type { AgentEvent, AgentTool, AgentMessage };
