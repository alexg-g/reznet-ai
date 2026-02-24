/**
 * Agent delegation tools — @mention parsing and inter-agent delegation.
 *
 * Ports the @mention parsing from backend/agents/processor.py.
 *
 * Agents can request work from other agents by mentioning them:
 *   "@backend can you create the API endpoint?"
 *
 * The delegation tool allows the LLM to explicitly delegate tasks.
 */

import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";

// ---------------------------------------------------------------------------
// @mention parsing
// ---------------------------------------------------------------------------

/** Known agent names that can be @mentioned. */
export const AGENT_NAMES = [
  "orchestrator",
  "backend",
  "frontend",
  "qa",
  "devops",
] as const;

export type AgentName = (typeof AGENT_NAMES)[number];

/** Regex to match @mentions of known agents. */
const MENTION_REGEX = new RegExp(
  `@(${AGENT_NAMES.join("|")})\\b`,
  "gi",
);

/**
 * Parse a message for @mentions of known agents.
 *
 * @returns Array of mentioned agent names (deduplicated, lowercase).
 */
export function parseMentions(message: string): AgentName[] {
  const mentions = new Set<AgentName>();
  let match: RegExpExecArray | null;

  // Reset regex state
  MENTION_REGEX.lastIndex = 0;

  while ((match = MENTION_REGEX.exec(message)) !== null) {
    mentions.add(match[1].toLowerCase() as AgentName);
  }

  return [...mentions];
}

/**
 * Check if a message is directed at a specific agent.
 */
export function isDirectedAt(message: string, agentName: string): boolean {
  const mentions = parseMentions(message);
  return mentions.includes(agentName.toLowerCase() as AgentName);
}

// ---------------------------------------------------------------------------
// Delegation callback type
// ---------------------------------------------------------------------------

/**
 * Callback invoked when an agent delegates a task.
 * The consuming code (processor/websocket) registers this to route the delegation.
 */
export type DelegationCallback = (
  targetAgent: AgentName,
  taskDescription: string,
  context?: Record<string, unknown>,
) => Promise<string>;

// ---------------------------------------------------------------------------
// Delegation tool factory
// ---------------------------------------------------------------------------

/**
 * Create a delegation tool that allows the agent to delegate tasks to other agents.
 *
 * @param onDelegate Callback invoked when the agent delegates work.
 *        Returns the delegated agent's response.
 */
export function createDelegationTool(
  onDelegate: DelegationCallback,
): AgentTool {
  return {
    name: "delegate_to_agent",
    label: "Delegate Task",
    description:
      "Delegate a task to another specialist agent. " +
      "Use when you need help from @backend, @frontend, @qa, @devops, or @orchestrator. " +
      "The target agent will process the task and return their response.",
    parameters: Type.Object({
      target_agent: Type.Union(
        AGENT_NAMES.map((name) => Type.Literal(name)),
        {
          description:
            "The agent to delegate to: orchestrator, backend, frontend, qa, or devops",
        },
      ),
      task_description: Type.String({
        description:
          "Clear description of the task to delegate. Be specific about what you need.",
      }),
    }),
    execute: async (_toolCallId, _params) => {
      const params = _params as { target_agent: string; task_description: string };
      const response = await onDelegate(
        params.target_agent as AgentName,
        params.task_description,
      );
      return {
        content: [
          {
            type: "text",
            text: `Response from @${params.target_agent}:\n${response}`,
          },
        ],
        details: {
          target_agent: params.target_agent,
          task: params.task_description,
        },
      };
    },
  };
}
