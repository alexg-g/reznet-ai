"""
Base Agent class for all specialist agents
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
import logging
from uuid import UUID

from agents.llm_client import LLMClient
from core.config import settings

logger = logging.getLogger(__name__)


class BaseAgent(ABC):
    """
    Base class for all AI agents in RezNet
    """

    def __init__(
        self,
        agent_id: UUID,
        name: str,
        agent_type: str,
        persona: Dict[str, Any],
        config: Optional[Dict[str, Any]] = None
    ):
        self.id = agent_id
        self.name = name
        self.agent_type = agent_type
        self.persona = persona
        self.config = config or {}

        # Initialize LLM client with dynamic provider/model selection
        # Allow per-agent override, otherwise use global defaults
        provider = self.config.get("provider", settings.DEFAULT_LLM_PROVIDER)

        # Get model - if not specified in agent config, use provider's default
        if "model" in self.config:
            model = self.config["model"]
        else:
            # Use provider-specific default model from settings
            if provider == "anthropic":
                model = settings.ANTHROPIC_DEFAULT_MODEL
            elif provider == "openai":
                model = settings.OPENAI_DEFAULT_MODEL
            elif provider == "ollama":
                model = settings.OLLAMA_DEFAULT_MODEL
            else:
                model = None

        self.llm = LLMClient(provider=provider, model=model)

        # Agent configuration
        self.temperature = self.config.get("temperature", settings.DEFAULT_TEMPERATURE)
        self.max_tokens = self.config.get("max_tokens", settings.MAX_TOKENS_PER_RESPONSE)

        # Status tracking
        self.status = "online"
        self.current_task = None

        logger.info(f"Initialized agent: {self.name} ({self.agent_type}) | Provider: {provider} | Model: {model}")

    def get_system_prompt(self) -> str:
        """
        Generate system prompt from persona
        """
        role = self.persona.get("role", "AI Assistant")
        goal = self.persona.get("goal", "Help users with their tasks")
        backstory = self.persona.get("backstory", "You are a helpful AI assistant.")
        capabilities = self.persona.get("capabilities", [])

        system_prompt = f"""You are {role}.

Your goal: {goal}

Background: {backstory}

Your key capabilities:
{chr(10).join('- ' + cap for cap in capabilities)}

Guidelines:
- Be professional, clear, and concise
- Provide actionable responses
- If you need more information, ask clarifying questions
- Admit when you don't know something
- Focus on your area of expertise
- Collaborate with other agents when needed (@backend, @frontend, @qa, @devops)

Remember: You are part of a team of AI agents working together on software development tasks.
"""
        return system_prompt

    async def process_message(
        self,
        message: str,
        context: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Process an incoming message and generate a response

        Args:
            message: The user message to process
            context: Additional context (conversation history, files, etc.)

        Returns:
            The agent's response
        """
        try:
            # Update status
            self.status = "thinking"

            # Build the prompt with context
            prompt = self._build_prompt(message, context)

            # Generate response using LLM
            response = await self.llm.generate(
                prompt=prompt,
                system=self.get_system_prompt(),
                temperature=self.temperature,
                max_tokens=self.max_tokens
            )

            # Post-process response if needed
            response = self._post_process_response(response, context)

            # Update status
            self.status = "online"

            return response

        except Exception as e:
            logger.error(f"Error processing message in {self.name}: {e}")
            self.status = "error"
            return f"I encountered an error while processing your request: {str(e)}"

    def _build_prompt(self, message: str, context: Optional[Dict[str, Any]] = None) -> str:
        """
        Build the full prompt including context

        Can be overridden by subclasses for custom prompt building
        """
        prompt_parts = []

        # Add context if provided
        if context:
            if context.get("conversation_history"):
                prompt_parts.append("Previous conversation:")
                for msg in context["conversation_history"][-5:]:  # Last 5 messages
                    prompt_parts.append(f"- {msg.get('author')}: {msg.get('content')}")
                prompt_parts.append("")

            if context.get("files"):
                prompt_parts.append("Relevant files:")
                for file in context["files"]:
                    prompt_parts.append(f"- {file.get('path')}")
                prompt_parts.append("")

            if context.get("project_info"):
                prompt_parts.append(f"Project context: {context['project_info']}")
                prompt_parts.append("")

        # Add the actual message
        prompt_parts.append(message)

        return "\n".join(prompt_parts)

    def _post_process_response(self, response: str, context: Optional[Dict[str, Any]] = None) -> str:
        """
        Post-process the LLM response

        Can be overridden by subclasses for custom post-processing
        """
        return response.strip()

    async def execute_task(self, task_description: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Execute a specific task

        Args:
            task_description: Description of the task to execute
            context: Additional context for the task

        Returns:
            Task result including output and metadata
        """
        try:
            self.status = "working"
            self.current_task = task_description

            # Process the task
            result = await self.process_message(task_description, context)

            self.status = "online"
            self.current_task = None

            return {
                "output": result,
                "status": "completed",
                "agent": self.name
            }

        except Exception as e:
            logger.error(f"Error executing task in {self.name}: {e}")
            self.status = "error"
            self.current_task = None

            return {
                "output": f"Task failed: {str(e)}",
                "status": "failed",
                "agent": self.name,
                "error": str(e)
            }

    def get_status(self) -> Dict[str, Any]:
        """Get current agent status"""
        return {
            "agent_id": str(self.id),
            "name": self.name,
            "type": self.agent_type,
            "status": self.status,
            "current_task": self.current_task
        }

    @abstractmethod
    def get_tools(self) -> List[Dict[str, Any]]:
        """
        Get list of tools/capabilities this agent can use
        Must be implemented by subclasses
        """
        pass
