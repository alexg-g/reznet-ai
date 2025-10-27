"""
Base Agent class for all specialist agents
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List, Tuple
import logging
import re
import xml.etree.ElementTree as ET
from uuid import UUID

from agents.llm_client import LLMClient
from agents.mcp_client import MCPFilesystemClient
from agents.tool_schemas import get_tool_schemas, get_tool_instructions
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

        # Initialize MCP filesystem client
        self.mcp_fs = MCPFilesystemClient()

        # Agent configuration
        self.temperature = self.config.get("temperature", settings.DEFAULT_TEMPERATURE)
        self.max_tokens = self.config.get("max_tokens", settings.MAX_TOKENS_PER_RESPONSE)

        # Tool configuration
        self.enable_tools = self.config.get("enable_tools", True)

        # Status tracking
        self.status = "online"
        self.current_task = None

        logger.info(f"Initialized agent: {self.name} ({self.agent_type}) | Provider: {provider} | Model: {model} | Tools: {self.enable_tools}")

    def get_system_prompt(self) -> str:
        """
        Generate system prompt from persona, including tool instructions
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

Task Execution Protocol:
- You work on ONE task at a time
- After completing a task, clearly indicate completion
- If you need another agent's help, mention them directly: "@backend can you..."
- Report your progress and any blockers

Remember: You are part of a team of AI agents working together on software development tasks.
When you mention another agent (like @backend), they will be automatically notified and can respond.
"""

        # Add tool instructions if tools are enabled
        if self.enable_tools:
            provider = self.llm.provider
            tool_instructions = get_tool_instructions(provider)
            system_prompt += "\n" + tool_instructions

        return system_prompt

    def get_full_system_prompt(self) -> str:
        """
        Get the complete assembled system prompt including all additions.
        This is the full prompt that the LLM receives.

        Returns:
            Complete system prompt with persona, tools, and instructions
        """
        return self.get_system_prompt()

    async def execute_tool(self, tool_name: str, tool_input: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute a tool call using MCP client

        Args:
            tool_name: Name of the tool to execute
            tool_input: Tool parameters/arguments

        Returns:
            Tool execution result
        """
        try:
            logger.info(f"Executing tool: {tool_name} with input: {tool_input}")

            # Route to appropriate MCP client method
            if tool_name == "read_file":
                result = await self.mcp_fs.read_file(tool_input.get("path"))
            elif tool_name == "write_file":
                result = await self.mcp_fs.write_file(
                    tool_input.get("path"),
                    tool_input.get("content")
                )
            elif tool_name == "list_directory":
                result = await self.mcp_fs.list_directory(tool_input.get("path", ""))
            elif tool_name == "create_directory":
                result = await self.mcp_fs.create_directory(tool_input.get("path"))
            elif tool_name == "delete_file":
                result = await self.mcp_fs.delete_file(tool_input.get("path"))
            elif tool_name == "file_exists":
                result = await self.mcp_fs.file_exists(tool_input.get("path"))
            else:
                result = {
                    "success": False,
                    "error": f"Unknown tool: {tool_name}"
                }

            logger.info(f"Tool {tool_name} result: {result.get('success', False)}")
            return result

        except Exception as e:
            logger.error(f"Error executing tool {tool_name}: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    def _parse_xml_tool_calls(self, text: str) -> Tuple[str, List[Dict[str, Any]]]:
        """
        Parse XML-formatted tool calls from LLM response (for Ollama)

        Args:
            text: Response text that may contain XML tool calls

        Returns:
            Tuple of (cleaned_text, tool_calls)
            - cleaned_text: Response with tool calls removed
            - tool_calls: List of extracted tool calls
        """
        tool_calls = []

        # Find all <tool_call> tags
        pattern = r'<tool_call\s+name="([^"]+)">(.*?)</tool_call>'
        matches = re.finditer(pattern, text, re.DOTALL)

        for match in matches:
            tool_name = match.group(1)
            tool_body = match.group(2)

            # Parse the tool body as XML to extract parameters
            try:
                # Wrap in root element for parsing
                xml_str = f"<root>{tool_body}</root>"
                root = ET.fromstring(xml_str)

                # Extract parameters
                tool_input = {}
                for child in root:
                    # Handle text content, stripping whitespace
                    tool_input[child.tag] = child.text.strip() if child.text else ""

                tool_calls.append({
                    "name": tool_name,
                    "input": tool_input
                })

                logger.debug(f"Parsed tool call: {tool_name} with input {tool_input}")

            except ET.ParseError as e:
                logger.error(f"Failed to parse tool call XML: {e}")
                continue

        # Remove tool calls from text
        cleaned_text = re.sub(pattern, '', text, flags=re.DOTALL)

        return cleaned_text.strip(), tool_calls if tool_calls else None

    async def process_message(
        self,
        message: str,
        context: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Process an incoming message and generate a response with tool support

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

            # Get tool schemas if tools are enabled
            tools = None
            if self.enable_tools and self.llm.has_native_tool_calling():
                tools = get_tool_schemas(self.llm.provider)

            # Generate response using LLM
            response, tool_calls = await self.llm.generate(
                prompt=prompt,
                system=self.get_system_prompt(),
                temperature=self.temperature,
                max_tokens=self.max_tokens,
                tools=tools
            )

            # Handle tool calls (native or XML-based)
            if self.enable_tools:
                # For Ollama (no native tool calling), parse XML
                if not self.llm.has_native_tool_calling():
                    response, tool_calls = self._parse_xml_tool_calls(response)

                # Execute tool calls if any
                if tool_calls:
                    logger.info(f"Agent {self.name} made {len(tool_calls)} tool call(s)")
                    tool_results = []

                    for tool_call in tool_calls:
                        tool_name = tool_call.get("name")
                        tool_input = tool_call.get("input", {})

                        result = await self.execute_tool(tool_name, tool_input)
                        tool_results.append({
                            "tool": tool_name,
                            "input": tool_input,
                            "result": result
                        })

                    # Format tool results for response
                    results_text = self._format_tool_results(tool_results)

                    # Append tool results to response
                    if response:
                        response = f"{response}\n\n{results_text}"
                    else:
                        response = results_text

            # Post-process response if needed
            response = self._post_process_response(response, context)

            # Update status
            self.status = "online"

            return response

        except Exception as e:
            logger.error(f"Error processing message in {self.name}: {e}")
            self.status = "error"
            return f"I encountered an error while processing your request: {str(e)}"

    def _format_tool_results(self, tool_results: List[Dict[str, Any]]) -> str:
        """
        Format tool execution results for display

        Args:
            tool_results: List of tool execution results

        Returns:
            Formatted string of results
        """
        lines = []
        for tr in tool_results:
            tool_name = tr["tool"]
            result = tr["result"]

            if result.get("success"):
                if tool_name == "write_file":
                    lines.append(f"✓ Created/updated file: {tr['input']['path']}")
                elif tool_name == "read_file":
                    lines.append(f"✓ Read file: {tr['input']['path']}")
                elif tool_name == "list_directory":
                    path = tr['input'].get('path', '/')
                    files = result.get('files', [])
                    lines.append(f"✓ Listed directory {path}: {len(files)} items")
                elif tool_name == "create_directory":
                    lines.append(f"✓ Created directory: {tr['input']['path']}")
                elif tool_name == "delete_file":
                    lines.append(f"✓ Deleted file: {tr['input']['path']}")
                elif tool_name == "file_exists":
                    exists = result.get('exists', False)
                    lines.append(f"✓ File {tr['input']['path']}: {'exists' if exists else 'not found'}")
            else:
                error = result.get("error", "Unknown error")
                lines.append(f"✗ Tool {tool_name} failed: {error}")

        return "\n".join(lines)

    def _build_prompt(self, message: str, context: Optional[Dict[str, Any]] = None) -> str:
        """
        Build the full prompt including context

        Can be overridden by subclasses for custom prompt building
        """
        prompt_parts = []

        # Add context if provided
        if context:
            # Add workspace instructions first (critical for file operations)
            if context.get("workspace_instructions"):
                prompt_parts.append(context["workspace_instructions"])
                prompt_parts.append("")

            if context.get("conversation_history"):
                prompt_parts.append("Previous conversation:")
                for msg in context["conversation_history"][-5:]:  # Last 5 messages
                    prompt_parts.append(f"- {msg.get('author')}: {msg.get('content')}")
                prompt_parts.append("")

            if context.get("previous_task_outputs"):
                prompt_parts.append("Previous task outputs (from tasks you depend on):")
                for dep in context["previous_task_outputs"]:
                    prompt_parts.append(f"- {dep.get('agent')} completed: {dep.get('task')}")
                    prompt_parts.append(f"  Result: {dep.get('output', '')[:200]}...")
                prompt_parts.append("")

            if context.get("files"):
                prompt_parts.append("Relevant files:")
                for file in context["files"]:
                    prompt_parts.append(f"- {file.get('path')}")
                prompt_parts.append("")

            if context.get("project_info"):
                prompt_parts.append(f"Project context: {context['project_info']}")
                prompt_parts.append("")

            # Add workflow context if present
            if context.get("workflow_request"):
                prompt_parts.append(f"Overall workflow goal: {context['workflow_request']}")
                prompt_parts.append(f"This is task {context.get('task_number', '?')} of {context.get('total_tasks', '?')}")
                prompt_parts.append("")

        # Add the actual message
        prompt_parts.append("YOUR TASK:")
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
