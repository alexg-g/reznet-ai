/**
 * Agent Template REST API Routes
 *
 * Fastify plugin exposing 8 endpoints for agent template CRUD, instantiation,
 * and listing agents derived from a template.
 *
 * Endpoints:
 *   POST   /agent-templates                           - Create a custom template
 *   GET    /agent-templates                           - List templates (with filters)
 *   GET    /agent-templates/name/:templateName        - Get template by name (registered BEFORE /:templateId)
 *   GET    /agent-templates/:templateId               - Get template by ID
 *   PUT    /agent-templates/:templateId               - Update template (custom only)
 *   DELETE /agent-templates/:templateId               - Delete template (custom only)
 *   POST   /agent-templates/:templateId/instantiate   - Create agent from template
 *   GET    /agent-templates/:templateId/agents        - List agents from template
 *
 * Route registration order:
 *   /agent-templates/name/:templateName is registered BEFORE /agent-templates/:templateId
 *   so the literal segment "name" takes priority over the ":templateId" wildcard.
 *
 * Python reference: backend/routers/agent_templates.py
 */

import { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { agentTemplates, agents } from "../db/schema.js";

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export async function templateRoutes(fastify: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // POST /agent-templates
  // Create a new custom agent template.
  // Body: { name, display_name, role, system_prompt, color?, icon?,
  //         available_tools?, llm_config?, domain? }
  // Returns 400 if name already taken. Returns 201 on success.
  // -------------------------------------------------------------------------

  fastify.post<{
    Body: {
      name: string;
      display_name: string;
      role: string;
      system_prompt: string;
      color?: string;
      icon?: string;
      available_tools?: string[];
      llm_config?: Record<string, unknown>;
      domain?: string;
    };
  }>("/agent-templates", async (request, reply) => {
    const {
      name,
      display_name,
      role,
      system_prompt,
      color,
      icon,
      available_tools,
      llm_config,
      domain,
    } = request.body;

    // Validate required fields
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return reply.status(400).send({ error: "name is required" });
    }
    if (!display_name || typeof display_name !== "string" || display_name.trim().length === 0) {
      return reply.status(400).send({ error: "display_name is required" });
    }
    if (!role || typeof role !== "string" || role.trim().length === 0) {
      return reply.status(400).send({ error: "role is required" });
    }
    if (!system_prompt || typeof system_prompt !== "string" || system_prompt.trim().length < 10) {
      return reply.status(400).send({
        error: "system_prompt is required and must be at least 10 characters",
      });
    }

    // Check name uniqueness
    const [existing] = await db
      .select()
      .from(agentTemplates)
      .where(eq(agentTemplates.name, name.trim()));

    if (existing) {
      return reply.status(400).send({
        error: `Template with name '${name.trim()}' already exists`,
      });
    }

    try {
      const [template] = await db
        .insert(agentTemplates)
        .values({
          name: name.trim(),
          displayName: display_name.trim(),
          role: role.trim(),
          systemPrompt: system_prompt.trim(),
          color: color ?? null,
          icon: icon ?? null,
          availableTools: available_tools ?? [],
          llmConfig: llm_config ?? {},
          domain: domain ?? null,
          templateType: "custom",
          isPublic: false,
          createdBy: "local-user",
        })
        .returning();

      fastify.log.info(`Agent template created: ${name} (${template.id})`);
      return reply.status(201).send(template);
    } catch (err) {
      fastify.log.error({ err }, "Failed to create agent template");
      return reply.status(500).send({ error: "Failed to create agent template" });
    }
  });

  // -------------------------------------------------------------------------
  // GET /agent-templates
  // List all templates, optionally filtered by domain and template_type.
  // Ordered by: templateType ASC, domain ASC, name ASC.
  // Returns: { templates, total, default_templates, custom_templates }
  // -------------------------------------------------------------------------

  fastify.get<{
    Querystring: {
      domain?: string;
      template_type?: string;
      include_private?: string;
    };
  }>("/agent-templates", async (request, reply) => {
    const { domain, template_type } = request.query;

    try {
      // Build base query — single-user MVP: no ownership filtering needed
      let rows = await db.select().from(agentTemplates).orderBy(
        agentTemplates.templateType,
        agentTemplates.domain,
        agentTemplates.name,
      );

      // Apply filters in-memory (avoids complex conditional Drizzle where clauses)
      if (domain) {
        rows = rows.filter((t) => t.domain === domain);
      }
      if (template_type) {
        rows = rows.filter((t) => t.templateType === template_type);
      }

      const total = rows.length;
      const defaultTemplates = rows.filter((t) => t.templateType === "default").length;
      const customTemplates = rows.filter((t) => t.templateType === "custom").length;

      return reply.send({
        templates: rows,
        total,
        default_templates: defaultTemplates,
        custom_templates: customTemplates,
      });
    } catch (err) {
      fastify.log.error({ err }, "Failed to list agent templates");
      return reply.status(500).send({ error: "Failed to retrieve agent templates" });
    }
  });

  // -------------------------------------------------------------------------
  // GET /agent-templates/name/:templateName
  // Get a template by its unique machine-readable name.
  // Registered BEFORE /agent-templates/:templateId to prevent "name" from
  // being interpreted as a templateId wildcard.
  // -------------------------------------------------------------------------

  fastify.get<{
    Params: { templateName: string };
  }>("/agent-templates/name/:templateName", async (request, reply) => {
    const { templateName } = request.params;

    const [template] = await db
      .select()
      .from(agentTemplates)
      .where(eq(agentTemplates.name, templateName));

    if (!template) {
      return reply.status(404).send({ error: `Template '${templateName}' not found` });
    }

    return reply.send(template);
  });

  // -------------------------------------------------------------------------
  // GET /agent-templates/:templateId
  // Get a template by UUID. 404 if not found.
  // -------------------------------------------------------------------------

  fastify.get<{
    Params: { templateId: string };
  }>("/agent-templates/:templateId", async (request, reply) => {
    const { templateId } = request.params;

    const [template] = await db
      .select()
      .from(agentTemplates)
      .where(eq(agentTemplates.id, templateId));

    if (!template) {
      return reply.status(404).send({ error: `Template ${templateId} not found` });
    }

    return reply.send(template);
  });

  // -------------------------------------------------------------------------
  // PUT /agent-templates/:templateId
  // Update a custom template. Default templates are read-only.
  // Body: partial fields from the template schema.
  // -------------------------------------------------------------------------

  fastify.put<{
    Params: { templateId: string };
    Body: {
      display_name?: string;
      role?: string;
      system_prompt?: string;
      color?: string;
      icon?: string;
      available_tools?: string[];
      llm_config?: Record<string, unknown>;
      domain?: string;
    };
  }>("/agent-templates/:templateId", async (request, reply) => {
    const { templateId } = request.params;

    const [template] = await db
      .select()
      .from(agentTemplates)
      .where(eq(agentTemplates.id, templateId));

    if (!template) {
      return reply.status(404).send({ error: `Template ${templateId} not found` });
    }

    if (template.templateType === "default") {
      return reply.status(400).send({
        error: "Cannot modify default templates. Create a custom template instead.",
      });
    }

    // Build update object from only the provided fields
    const {
      display_name,
      role,
      system_prompt,
      color,
      icon,
      available_tools,
      llm_config,
      domain,
    } = request.body;

    const updateFields: Partial<{
      displayName: string;
      role: string;
      systemPrompt: string;
      color: string;
      icon: string;
      availableTools: string[];
      llmConfig: Record<string, unknown>;
      domain: string;
      updatedAt: Date;
    }> = { updatedAt: new Date() };

    if (display_name !== undefined) updateFields.displayName = display_name;
    if (role !== undefined) updateFields.role = role;
    if (system_prompt !== undefined) updateFields.systemPrompt = system_prompt;
    if (color !== undefined) updateFields.color = color;
    if (icon !== undefined) updateFields.icon = icon;
    if (available_tools !== undefined) updateFields.availableTools = available_tools;
    if (llm_config !== undefined) updateFields.llmConfig = llm_config;
    if (domain !== undefined) updateFields.domain = domain;

    try {
      const [updated] = await db
        .update(agentTemplates)
        .set(updateFields)
        .where(eq(agentTemplates.id, templateId))
        .returning();

      fastify.log.info(`Agent template updated: ${template.name} (${templateId})`);
      return reply.send(updated);
    } catch (err) {
      fastify.log.error({ err }, "Failed to update agent template");
      return reply.status(500).send({ error: "Failed to update agent template" });
    }
  });

  // -------------------------------------------------------------------------
  // DELETE /agent-templates/:templateId
  // Delete a custom template. Default templates are protected.
  // Returns 204 No Content on success.
  // Note: does NOT cascade-delete agents instantiated from this template.
  // -------------------------------------------------------------------------

  fastify.delete<{
    Params: { templateId: string };
  }>("/agent-templates/:templateId", async (request, reply) => {
    const { templateId } = request.params;

    const [template] = await db
      .select()
      .from(agentTemplates)
      .where(eq(agentTemplates.id, templateId));

    if (!template) {
      return reply.status(404).send({ error: `Template ${templateId} not found` });
    }

    if (template.templateType === "default") {
      return reply.status(400).send({ error: "Cannot delete default templates" });
    }

    try {
      await db.delete(agentTemplates).where(eq(agentTemplates.id, templateId));

      fastify.log.info(`Agent template deleted: ${template.name} (${templateId})`);
      return reply.status(204).send();
    } catch (err) {
      fastify.log.error({ err }, "Failed to delete agent template");
      return reply.status(500).send({ error: "Failed to delete agent template" });
    }
  });

  // -------------------------------------------------------------------------
  // POST /agent-templates/:templateId/instantiate
  // Create a new agent record from a template.
  // Query: agent_name_override? — override the default "@{template.name}" name.
  //
  // Agent name gets the "@" prefix if not already present.
  // 400 if an agent with that name already exists.
  // -------------------------------------------------------------------------

  fastify.post<{
    Params: { templateId: string };
    Querystring: { agent_name_override?: string };
  }>("/agent-templates/:templateId/instantiate", async (request, reply) => {
    const { templateId } = request.params;
    const { agent_name_override } = request.query;

    const [template] = await db
      .select()
      .from(agentTemplates)
      .where(eq(agentTemplates.id, templateId));

    if (!template) {
      return reply.status(404).send({ error: `Template ${templateId} not found` });
    }

    // Determine agent name
    let agentName = agent_name_override ?? `@${template.name}`;
    if (!agentName.startsWith("@")) {
      agentName = `@${agentName}`;
    }

    // Check uniqueness
    const [existingAgent] = await db
      .select()
      .from(agents)
      .where(eq(agents.name, agentName));

    if (existingAgent) {
      return reply.status(400).send({
        error: `Agent with name '${agentName}' already exists. Choose a different name.`,
      });
    }

    try {
      const [newAgent] = await db
        .insert(agents)
        .values({
          name: agentName,
          agentType: template.domain ?? "custom",
          persona: {
            role: template.role,
            goal: `Assist with ${template.role.toLowerCase()} tasks`,
            backstory: template.systemPrompt.slice(0, 500),
            capabilities: template.availableTools,
            display_name: template.displayName,
            color: template.color,
            icon: template.icon,
          },
          config: {
            ...(template.llmConfig as Record<string, unknown>),
            available_tools: template.availableTools,
            system_prompt: template.systemPrompt,
            template_id: template.id,
          },
          isActive: true,
        })
        .returning();

      fastify.log.info(
        `Agent '${agentName}' instantiated from template '${template.name}' (${templateId})`,
      );
      return reply.status(201).send(newAgent);
    } catch (err) {
      fastify.log.error({ err }, "Failed to instantiate agent from template");
      return reply.status(500).send({ error: "Failed to create agent from template" });
    }
  });

  // -------------------------------------------------------------------------
  // GET /agent-templates/:templateId/agents
  // List all agents that were created from a specific template.
  // Matches agents where config->'template_id' equals the templateId.
  // -------------------------------------------------------------------------

  fastify.get<{
    Params: { templateId: string };
  }>("/agent-templates/:templateId/agents", async (request, reply) => {
    const { templateId } = request.params;

    // Verify template exists
    const [template] = await db
      .select()
      .from(agentTemplates)
      .where(eq(agentTemplates.id, templateId));

    if (!template) {
      return reply.status(404).send({ error: `Template ${templateId} not found` });
    }

    // Query agents whose JSONB config contains template_id = templateId
    const rows = await db
      .select()
      .from(agents)
      .where(sql`${agents.config}->>'template_id' = ${templateId}`);

    return reply.send(rows);
  });
}
