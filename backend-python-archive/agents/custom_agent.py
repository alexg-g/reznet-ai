"""
Custom/Dynamic Agent Implementation

Provides a generic agent class for user-created agents that dynamically
loads system prompts and configuration from the database.
"""

from typing import Dict, Any, List, Optional
from agents.base_with_memory import BaseAgentWithMemory


class CustomAgent(BaseAgentWithMemory):
    """
    Generic agent class for custom user-created agents

    This class provides full semantic memory support while allowing
    completely custom system prompts and configurations defined by users.

    System prompts are loaded from agent.config['system_prompt'] at runtime,
    giving users 100% control over agent behavior.
    """

    def __init__(
        self,
        agent_id,
        name: str,
        agent_type: str,
        persona: Dict[str, Any],
        config: Optional[Dict[str, Any]] = None,
        db = None
    ):
        """
        Initialize custom agent with dynamic configuration

        Args:
            agent_id: Agent UUID
            name: Agent name (e.g., "@marketing-analyst")
            agent_type: Agent type (usually 'custom' or domain like 'marketing')
            persona: Agent persona with display_name, color, icon, etc.
            config: Configuration including system_prompt, available_tools, llm_config
            db: Database session for semantic memory
        """
        super().__init__(agent_id, name, agent_type, persona, config, db)

        # Store custom system prompt from config
        self._custom_system_prompt = config.get('system_prompt') if config else None

        # Store available tools from config
        self._available_tools = config.get('available_tools', []) if config else []

    def get_system_prompt(self) -> str:
        """
        Get custom system prompt defined by user

        Returns custom prompt from config, or falls back to base prompt if not defined.
        """
        if self._custom_system_prompt:
            # Use custom system prompt from template/config
            return self._custom_system_prompt
        else:
            # Fallback to base prompt (shouldn't happen for properly configured custom agents)
            return super().get_system_prompt()

    def get_tools(self) -> List[Dict[str, Any]]:
        """
        Get available tools for this agent

        Returns tools list from config (MCP server names).
        """
        if not self._available_tools:
            return []

        # Convert tool names to tool dictionaries
        # available_tools is a list of MCP server names like ["filesystem", "github"]
        tools = []
        for tool_name in self._available_tools:
            tools.append({
                "name": tool_name,
                "description": f"Access to {tool_name} MCP server"
            })

        return tools
