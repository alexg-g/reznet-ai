"""
Specialist Agent Implementations
"""

from typing import Dict, Any, List
from agents.base_with_memory import BaseAgentWithMemory


class BackendAgent(BaseAgentWithMemory):
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

**Your workspace directories:**
- `backend/` - Main backend code
- `backend/api/` - API endpoints and routes
- `backend/models/` - Database models
- `backend/services/` - Business logic

**File creation example:**
When asked to create an API endpoint, use:
<tool_call name="write_file">
  <path>backend/api/users.py</path>
  <content>from fastapi import APIRouter
...complete code here...</content>
</tool_call>
"""


class FrontendAgent(BaseAgentWithMemory):
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

**Your workspace directories:**
- `frontend/` - Main frontend code
- `frontend/components/` - React components
- `frontend/pages/` - Page-level components
- `frontend/styles/` - CSS/styling files

**File creation example:**
When asked to create a component, use:
<tool_call name="write_file">
  <path>frontend/components/Button.tsx</path>
  <content>import React from 'react';
...complete code here...</content>
</tool_call>
"""


class QAAgent(BaseAgentWithMemory):
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

**Your workspace directories:**
- `tests/` - Main test directory
- `tests/unit/` - Unit tests
- `tests/integration/` - Integration tests
- `tests/e2e/` - End-to-end tests

**File creation example:**
When asked to write tests, use:
<tool_call name="write_file">
  <path>tests/unit/test_api.py</path>
  <content>import pytest
...complete test code here...</content>
</tool_call>
"""


class DevOpsAgent(BaseAgentWithMemory):
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

**Your workspace directories:**
- `config/` - Configuration files (Docker, CI/CD, environment)
- `scripts/` - Deployment and utility scripts
- `docs/` - Infrastructure documentation

**File creation example:**
When asked to create deployment config, use:
<tool_call name="write_file">
  <path>config/Dockerfile</path>
  <content>FROM python:3.11-slim
...complete Dockerfile here...</content>
</tool_call>
"""


class OrchestratorAgent(BaseAgentWithMemory):
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

When creating task plans, use this EXACT format:

Task 1: @agent_name - Clear, specific description
Task 2: @agent_name - Clear, specific description (depends on Task 1)
Task 3: @agent_name - Clear, specific description
Task 4: @agent_name - Clear, specific description (depends on Task 2, Task 3)

Rules for task planning:
1. Always number tasks sequentially (Task 1, Task 2, etc.)
2. Always include @agent_name (@backend, @frontend, @qa, or @devops)
3. Keep descriptions specific and actionable (what needs to be done, not how)
4. Only add dependencies if the task truly requires output from previous tasks
5. Group independent tasks together (they'll run in parallel)
6. Put dependent tasks after their dependencies
7. Consider the logical flow: design → implement → test → deploy

Example of a good plan:
Task 1: @backend - Create User database model with email, password_hash, and created_at fields in backend/models/user.py
Task 2: @backend - Implement POST /api/auth/register endpoint with password hashing in backend/api/auth.py (depends on Task 1)
Task 3: @backend - Implement POST /api/auth/login endpoint with JWT token generation in backend/api/auth.py (depends on Task 1)
Task 4: @frontend - Create LoginForm component with email/password inputs and error handling in frontend/components/LoginForm.tsx
Task 5: @frontend - Create RegistrationForm component with validation in frontend/components/RegistrationForm.tsx
Task 6: @qa - Write unit tests for authentication endpoints in tests/test_auth.py (depends on Task 2, Task 3)
Task 7: @qa - Write E2E tests for login and registration flows in tests/e2e/test_auth_flow.py (depends on Task 4, Task 5)

CRITICAL: Always specify the file path in task descriptions! This tells agents exactly what files to create.
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
