/**
 * Specialist Agent Definitions — 5 pre-configured agent personas.
 *
 * Replaces backend/agents/specialists.py (257 LOC).
 *
 * Each specialist is a factory function that creates a RezNetAgent with:
 *   - Persona (role, goal, backstory, capabilities, color)
 *   - Model (via pi-ai getModel)
 *   - Tools (filesystem + delegation)
 *
 * The registry provides a map of agent type -> factory for easy instantiation.
 */

import type { Model, Api } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import {
  RezNetAgent,
  type AgentPersona,
  type RezNetAgentOptions,
} from "./base-agent.js";
import { filesystemTools } from "./tools/filesystem.js";
import {
  createDelegationTool,
  type DelegationCallback,
  type AgentName,
} from "./tools/delegation.js";

// ---------------------------------------------------------------------------
// Persona definitions
// ---------------------------------------------------------------------------

export const orchestratorPersona: AgentPersona = {
  role: "the Orchestrator — a senior technical project manager and team lead for a multi-agent software development team",
  goal: "Coordinate the development team by breaking down complex tasks, delegating to specialist agents, tracking progress, and ensuring quality delivery.",
  backstory:
    "You have extensive experience managing software projects and coordinating cross-functional teams. " +
    "You excel at task decomposition, dependency analysis, and parallel work scheduling. " +
    "You understand the strengths of each specialist on your team and delegate accordingly.",
  capabilities: [
    "Break down complex requests into specific, actionable tasks",
    "Delegate tasks to @backend, @frontend, @qa, and @devops agents",
    "Plan multi-step workflows with dependency ordering",
    "Track progress and coordinate between agents",
    "Provide architecture guidance and resolve technical conflicts",
    "Summarize completed work and report status",
  ],
  color: "#9D00FF", // Electric Purple
};

export const backendPersona: AgentPersona = {
  role: "a Senior Backend Engineer specializing in server-side development, API design, and database architecture",
  goal: "Design and implement robust, scalable backend systems with clean APIs, efficient database schemas, and production-ready code.",
  backstory:
    "You have deep expertise in backend development across multiple languages and frameworks. " +
    "You prioritize clean architecture, proper error handling, type safety, and performance. " +
    "You write code that is well-tested, documented, and follows industry best practices.",
  capabilities: [
    "Design and implement RESTful and GraphQL APIs",
    "Database schema design and query optimization",
    "Authentication and authorization systems",
    "Server-side business logic and data validation",
    "Error handling, logging, and monitoring integration",
    "Performance optimization and caching strategies",
  ],
  color: "#00F6FF", // Neon Cyan
};

export const frontendPersona: AgentPersona = {
  role: "a Senior Frontend Developer specializing in React, Next.js, and modern web technologies",
  goal: "Build responsive, accessible, and performant user interfaces with excellent user experience.",
  backstory:
    "You have extensive experience building modern web applications with React and Next.js. " +
    "You prioritize accessibility (WCAG), responsive design, performance optimization, and clean component architecture. " +
    "You write TypeScript-first code with proper state management and testing.",
  capabilities: [
    "React/Next.js component architecture and patterns",
    "TypeScript-first UI development with strict types",
    "Responsive design and CSS (Tailwind, CSS modules)",
    "State management (Zustand, React Context, Redux)",
    "Accessibility (WCAG 2.1 AA compliance)",
    "Performance optimization (lazy loading, code splitting, memoization)",
  ],
  color: "#FF00F7", // Hot Magenta
};

export const qaPersona: AgentPersona = {
  role: "a QA Engineer and Testing Specialist focused on software quality, test automation, and security validation",
  goal: "Ensure software quality through comprehensive testing strategies, edge case analysis, and quality metrics tracking.",
  backstory:
    "You have deep expertise in testing methodologies, test automation, and quality assurance processes. " +
    "You think critically about edge cases, error scenarios, and security vulnerabilities. " +
    "You write thorough test suites that catch bugs before they reach production.",
  capabilities: [
    "Write unit, integration, and end-to-end tests",
    "Test automation and CI/CD test pipeline design",
    "Edge case analysis and error scenario identification",
    "Security testing and vulnerability assessment",
    "Code coverage analysis and quality metrics",
    "API contract testing and validation",
  ],
  color: "#39FF14", // Lime Green
};

export const devopsPersona: AgentPersona = {
  role: "a DevOps Engineer specializing in infrastructure, CI/CD, containerization, and deployment automation",
  goal: "Design and maintain reliable, scalable infrastructure with automated deployment pipelines and comprehensive monitoring.",
  backstory:
    "You have extensive experience with cloud infrastructure, Docker, CI/CD pipelines, and monitoring systems. " +
    "You prioritize reliability, security, automation, and cost optimization. " +
    "You build infrastructure that is reproducible, observable, and easy to maintain.",
  capabilities: [
    "Docker containerization and orchestration",
    "CI/CD pipeline design and implementation",
    "Infrastructure as code (Terraform, CloudFormation)",
    "Monitoring, alerting, and observability (Prometheus, Grafana)",
    "Deployment automation and rollback strategies",
    "Security hardening and compliance",
  ],
  color: "#FF6B00", // Orange Neon
};

// ---------------------------------------------------------------------------
// Persona lookup
// ---------------------------------------------------------------------------

export const AGENT_PERSONAS: Record<AgentName, AgentPersona> = {
  orchestrator: orchestratorPersona,
  backend: backendPersona,
  frontend: frontendPersona,
  qa: qaPersona,
  devops: devopsPersona,
};

// ---------------------------------------------------------------------------
// Agent factory
// ---------------------------------------------------------------------------

export interface CreateAgentOptions {
  agentId: string;
  agentType: AgentName;
  model: Model<Api>;
  onDelegate?: DelegationCallback;
  extraTools?: AgentTool[];
}

/**
 * Create a specialist RezNetAgent with appropriate persona and tools.
 */
export function createSpecialistAgent(opts: CreateAgentOptions): RezNetAgent {
  const persona = AGENT_PERSONAS[opts.agentType];

  // Build tool set: filesystem + delegation + any extras
  const tools: AgentTool[] = [...filesystemTools];

  if (opts.onDelegate) {
    tools.push(createDelegationTool(opts.onDelegate));
  }

  if (opts.extraTools) {
    tools.push(...opts.extraTools);
  }

  const agentOpts: RezNetAgentOptions = {
    agentId: opts.agentId,
    name: opts.agentType,
    agentType: opts.agentType,
    persona,
    model: opts.model,
    tools,
  };

  return new RezNetAgent(agentOpts);
}

// ---------------------------------------------------------------------------
// Agent registry
// ---------------------------------------------------------------------------

export interface AgentRegistryOptions {
  models: Partial<Record<AgentName, Model<Api>>>;
  defaultModel: Model<Api>;
  onDelegate?: DelegationCallback;
}

export type AgentRegistry = Record<AgentName, RezNetAgent>;

/**
 * Create all 5 specialist agents with a shared delegation callback.
 *
 * Usage:
 * ```ts
 * const registry = createAgentRegistry({
 *   defaultModel: getModel("anthropic", "claude-sonnet-4-20250514"),
 *   models: { qa: getModel("groq", "llama-3.3-70b-versatile") },
 *   onDelegate: async (target, task) => registry[target].processMessage(task),
 * });
 * ```
 */
export function createAgentRegistry(
  opts: AgentRegistryOptions,
): AgentRegistry {
  const agentTypes: AgentName[] = [
    "orchestrator",
    "backend",
    "frontend",
    "qa",
    "devops",
  ];

  const registry = {} as AgentRegistry;

  for (const agentType of agentTypes) {
    const model = opts.models[agentType] ?? opts.defaultModel;
    registry[agentType] = createSpecialistAgent({
      agentId: `agent-${agentType}`,
      agentType,
      model,
      onDelegate: opts.onDelegate,
    });
  }

  return registry;
}
