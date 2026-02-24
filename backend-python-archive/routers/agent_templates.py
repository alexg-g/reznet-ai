"""
Agent Template endpoints for custom agent creation (Issue #18)
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import select, func
from typing import List, Optional
from uuid import UUID
import logging

from core.database import get_db
from models.database import AgentTemplate, Agent
from models.schemas import (
    AgentTemplateCreate,
    AgentTemplateUpdate,
    AgentTemplateResponse,
    AgentTemplateListResponse,
    AgentResponse
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/agent-templates", response_model=AgentTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_agent_template(
    template: AgentTemplateCreate,
    db: Session = Depends(get_db)
):
    """
    Create a new agent template.

    This template can be used to instantiate custom agents with predefined
    personas, system prompts, and configurations.

    Requirements:
    - Name: Lowercase alphanumeric with hyphens (unique)
    - Display name: 1-100 characters
    - Role: 1-200 characters
    - System prompt: 10-10000 characters
    - Color: Optional hex color (#RRGGBB)
    - Icon: Optional emoji or icon (max 10 chars)
    """
    try:
        # Check if template name already exists
        existing = db.query(AgentTemplate).filter(
            AgentTemplate.name == template.name
        ).first()

        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Template with name '{template.name}' already exists"
            )

        # Create template
        db_template = AgentTemplate(
            name=template.name,
            display_name=template.display_name,
            role=template.role,
            system_prompt=template.system_prompt,
            color=template.color,
            icon=template.icon,
            available_tools=template.available_tools,
            llm_config=template.llm_config or {},
            domain=template.domain,
            template_type='custom',  # User-created templates are always 'custom'
            is_public=False,  # Default to private
            created_by='local-user'  # Will be replaced with actual user ID in Phase 3
        )

        db.add(db_template)
        db.commit()
        db.refresh(db_template)

        logger.info(f"Created agent template: {template.name} (ID: {db_template.id})")

        return db_template

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating agent template: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create agent template. Please try again."
        )


@router.get("/agent-templates", response_model=AgentTemplateListResponse)
async def list_agent_templates(
    domain: Optional[str] = Query(None, description="Filter by domain (e.g., 'marketing', 'legal')"),
    template_type: Optional[str] = Query(None, description="Filter by type: 'default', 'custom', 'community'"),
    include_private: bool = Query(True, description="Include private templates (for current user)"),
    db: Session = Depends(get_db)
):
    """
    List all agent templates with optional filtering.

    Returns templates grouped by type with summary statistics.
    """
    try:
        query = db.query(AgentTemplate)

        # Apply filters
        if domain:
            query = query.filter(AgentTemplate.domain == domain)

        if template_type:
            query = query.filter(AgentTemplate.template_type == template_type)

        # For now, show all templates since we're single-user
        # In Phase 3, filter by is_public OR created_by == current_user

        # Order by type (default first), then domain, then name
        query = query.order_by(
            AgentTemplate.template_type,
            AgentTemplate.domain,
            AgentTemplate.name
        )

        templates = query.all()

        # Calculate statistics
        total = len(templates)
        default_count = sum(1 for t in templates if t.template_type == 'default')
        custom_count = sum(1 for t in templates if t.template_type == 'custom')

        return AgentTemplateListResponse(
            templates=templates,
            total=total,
            default_templates=default_count,
            custom_templates=custom_count
        )

    except Exception as e:
        logger.error(f"Error listing agent templates: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve agent templates"
        )


@router.get("/agent-templates/{template_id}", response_model=AgentTemplateResponse)
async def get_agent_template(
    template_id: UUID,
    db: Session = Depends(get_db)
):
    """
    Get a specific agent template by ID.

    Returns detailed information about the template including full system prompt.
    """
    template = db.query(AgentTemplate).filter(
        AgentTemplate.id == template_id
    ).first()

    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template {template_id} not found"
        )

    return template


@router.get("/agent-templates/name/{template_name}", response_model=AgentTemplateResponse)
async def get_agent_template_by_name(
    template_name: str,
    db: Session = Depends(get_db)
):
    """
    Get a specific agent template by name.

    Useful for looking up templates by their unique identifier.
    """
    template = db.query(AgentTemplate).filter(
        AgentTemplate.name == template_name
    ).first()

    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template '{template_name}' not found"
        )

    return template


@router.put("/agent-templates/{template_id}", response_model=AgentTemplateResponse)
async def update_agent_template(
    template_id: UUID,
    updates: AgentTemplateUpdate,
    db: Session = Depends(get_db)
):
    """
    Update an agent template.

    Only custom templates can be modified. Default templates are read-only.
    """
    template = db.query(AgentTemplate).filter(
        AgentTemplate.id == template_id
    ).first()

    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template {template_id} not found"
        )

    # Prevent modifying default templates
    if template.template_type == 'default':
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot modify default templates. Create a custom template instead."
        )

    try:
        # Update only provided fields
        update_data = updates.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(template, field, value)

        db.commit()
        db.refresh(template)

        logger.info(f"Updated agent template: {template.name} (ID: {template_id})")

        return template

    except Exception as e:
        logger.error(f"Error updating agent template: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update agent template"
        )


@router.delete("/agent-templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent_template(
    template_id: UUID,
    db: Session = Depends(get_db)
):
    """
    Delete an agent template.

    Only custom templates can be deleted. Default templates are protected.
    This will NOT delete agents that were instantiated from this template.
    """
    template = db.query(AgentTemplate).filter(
        AgentTemplate.id == template_id
    ).first()

    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template {template_id} not found"
        )

    # Prevent deleting default templates
    if template.template_type == 'default':
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete default templates"
        )

    try:
        template_name = template.name
        db.delete(template)
        db.commit()

        logger.info(f"Deleted agent template: {template_name} (ID: {template_id})")

    except Exception as e:
        logger.error(f"Error deleting agent template: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete agent template"
        )


@router.post("/agent-templates/{template_id}/instantiate", response_model=AgentResponse)
async def instantiate_agent_from_template(
    template_id: UUID,
    agent_name_override: Optional[str] = Query(None, description="Override agent name (default: template name with @ prefix)"),
    db: Session = Depends(get_db)
):
    """
    Create a new agent instance from a template.

    This creates a fully functional agent in the agents table based on the
    template configuration. The agent will inherit:
    - System prompt from template
    - LLM configuration (provider, model, temperature)
    - Available tools (MCP servers)
    - Color and icon for UI display

    The instantiated agent can be invoked like any other agent using @mentions.
    """
    # Get template
    template = db.query(AgentTemplate).filter(
        AgentTemplate.id == template_id
    ).first()

    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template {template_id} not found"
        )

    # Determine agent name
    agent_name = agent_name_override or f"@{template.name}"
    if not agent_name.startswith('@'):
        agent_name = f"@{agent_name}"

    # Check if agent with this name already exists
    existing_agent = db.query(Agent).filter(
        Agent.name == agent_name
    ).first()

    if existing_agent:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Agent with name '{agent_name}' already exists. Choose a different name."
        )

    try:
        # Create agent from template
        agent = Agent(
            name=agent_name,
            agent_type=template.domain or 'custom',
            persona={
                'role': template.role,
                'goal': f"Assist with {template.role.lower()} tasks",
                'backstory': template.system_prompt[:500],  # Truncate for persona
                'capabilities': template.available_tools,
                'display_name': template.display_name,
                'color': template.color,
                'icon': template.icon
            },
            config={
                **template.llm_config,
                'available_tools': template.available_tools,
                'system_prompt': template.system_prompt,  # Full prompt in config
                'template_id': str(template.id)
            },
            is_active=True
        )

        db.add(agent)
        db.commit()
        db.refresh(agent)

        logger.info(f"Instantiated agent '{agent_name}' from template '{template.name}' (Template ID: {template_id})")

        return agent

    except Exception as e:
        logger.error(f"Error instantiating agent from template: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create agent from template"
        )


@router.get("/agent-templates/{template_id}/agents", response_model=List[AgentResponse])
async def list_agents_from_template(
    template_id: UUID,
    db: Session = Depends(get_db)
):
    """
    List all agents instantiated from a specific template.

    Returns all agents that were created using this template as their base.
    """
    # Verify template exists
    template = db.query(AgentTemplate).filter(
        AgentTemplate.id == template_id
    ).first()

    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template {template_id} not found"
        )

    # Find all agents with this template_id in their config
    # Note: This requires JSONB query capabilities
    agents = db.query(Agent).filter(
        Agent.config['template_id'].astext == str(template_id)
    ).all()

    return agents
