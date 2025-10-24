"""
Specialist Agent Implementations
"""

from typing import Dict, Any, List
from agents.base import BaseAgent


class BackendAgent(BaseAgent):
    """Backend development specialist"""

    def get_tools(self) -> List[Dict[str, Any]]:
        return [
            {"name": "filesystem", "description": "Read/write code files"},
            {"name": "database", "description": "Database operations"},
            {"name": "api_testing", "description": "Test API endpoints"}
        ]

    def get_system_prompt(self) -> str:
        base_prompt = super().get_system_prompt()
        return base_prompt + """

Additional Backend-Specific Guidelines:
- Write production-ready, well-tested code
- Follow Python/FastAPI best practices
- Consider performance and scalability
- Implement proper error handling and validation
- Use type hints and documentation
- Consider database design and optimization
- Implement RESTful API patterns
"""


class FrontendAgent(BaseAgent):
    """Frontend development specialist"""

    def get_tools(self) -> List[Dict[str, Any]]:
        return [
            {"name": "filesystem", "description": "Read/write code files"},
            {"name": "component_preview", "description": "Preview React components"}
        ]

    def get_system_prompt(self) -> str:
        base_prompt = super().get_system_prompt()
        return base_prompt + """

Additional Frontend-Specific Guidelines:
- Build responsive, accessible interfaces
- Follow React/Next.js best practices
- Use TypeScript for type safety
- Implement proper state management
- Optimize for performance (lazy loading, code splitting)
- Follow modern CSS practices (Tailwind, CSS modules)
- Ensure cross-browser compatibility
- Focus on user experience and accessibility (WCAG)
"""


class QAAgent(BaseAgent):
    """QA and testing specialist"""

    def get_tools(self) -> List[Dict[str, Any]]:
        return [
            {"name": "filesystem", "description": "Read/write test files"},
            {"name": "test_runner", "description": "Run tests"},
            {"name": "coverage", "description": "Check code coverage"}
        ]

    def get_system_prompt(self) -> str:
        base_prompt = super().get_system_prompt()
        return base_prompt + """

Additional QA-Specific Guidelines:
- Write comprehensive test cases (unit, integration, e2e)
- Think about edge cases and error scenarios
- Implement test automation
- Check code coverage and quality metrics
- Perform security testing when relevant
- Validate API contracts
- Test for accessibility
- Document test plans and results
"""


class DevOpsAgent(BaseAgent):
    """DevOps and infrastructure specialist"""

    def get_tools(self) -> List[Dict[str, Any]]:
        return [
            {"name": "filesystem", "description": "Read/write config files"},
            {"name": "docker", "description": "Docker operations"},
            {"name": "deployment", "description": "Deploy applications"}
        ]

    def get_system_prompt(self) -> str:
        base_prompt = super().get_system_prompt()
        return base_prompt + """

Additional DevOps-Specific Guidelines:
- Design scalable, reliable infrastructure
- Implement CI/CD pipelines
- Use Docker and containerization best practices
- Monitor application health and performance
- Implement security best practices
- Optimize resource usage and costs
- Document infrastructure and deployment processes
- Plan for disaster recovery
"""


class OrchestratorAgent(BaseAgent):
    """Orchestrator that coordinates other agents"""

    def get_tools(self) -> List[Dict[str, Any]]:
        return [
            {"name": "task_delegation", "description": "Delegate tasks to specialist agents"},
            {"name": "coordination", "description": "Coordinate between agents"},
            {"name": "planning", "description": "Create project plans"}
        ]

    def get_system_prompt(self) -> str:
        base_prompt = super().get_system_prompt()
        return base_prompt + """

Additional Orchestrator-Specific Guidelines:
- Break down complex tasks into smaller, manageable pieces
- Delegate tasks to the appropriate specialist agents:
  * @backend - For API development, database work, server-side logic
  * @frontend - For UI/UX, React components, styling
  * @qa - For testing, quality assurance
  * @devops - For deployment, infrastructure, CI/CD
- Coordinate work between agents to ensure integration
- Track progress and ensure timely delivery
- Provide high-level architecture guidance
- Resolve conflicts and blockers
- Summarize completed work

When users ask for complex features:
1. Analyze requirements and break them down
2. Create a task plan
3. Assign tasks to appropriate agents using @mentions
4. Coordinate their work
5. Ensure integration and testing
"""

    async def process_message(
        self,
        message: str,
        context: Dict[str, Any] = None
    ) -> str:
        """
        Orchestrator processes messages and delegates to other agents
        """
        # Check if this is a complex task that needs delegation
        message_lower = message.lower()

        # Keywords that indicate complex tasks requiring orchestration
        orchestration_keywords = [
            'build', 'create', 'implement', 'develop', 'feature',
            'application', 'system', 'project', 'integrate'
        ]

        needs_orchestration = any(keyword in message_lower for keyword in orchestration_keywords)

        if needs_orchestration and len(message_lower.split()) > 5:
            # This is a complex task - provide orchestration guidance
            prompt = f"""Analyze this request and create a task breakdown:

{message}

Provide:
1. Brief analysis of what's needed
2. Task breakdown with assignments to specific agents (@backend, @frontend, @qa, @devops)
3. Any architecture decisions or considerations
4. Suggested order of implementation

Format your response to be clear and actionable."""

            return await super().process_message(prompt, context)
        else:
            # Simple query or coordination
            return await super().process_message(message, context)
