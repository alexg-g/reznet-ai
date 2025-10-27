"""
Initialize workspace with standard project structure

Run this once to create the baseline directory structure that agents will use.
"""

import os
from pathlib import Path

# Workspace root
WORKSPACE_ROOT = Path(__file__).parent.parent / "data" / "workspaces"


def init_workspace_structure():
    """Create standard workspace directory structure"""

    # Define structure
    directories = [
        "backend",
        "backend/api",
        "backend/models",
        "backend/services",
        "frontend",
        "frontend/components",
        "frontend/pages",
        "frontend/styles",
        "tests",
        "tests/unit",
        "tests/integration",
        "tests/e2e",
        "docs",
        "config",
        "scripts",
    ]

    # Create directories
    for dir_path in directories:
        full_path = WORKSPACE_ROOT / dir_path
        full_path.mkdir(parents=True, exist_ok=True)
        print(f"✓ Created: {dir_path}/")

    # Create README with instructions for agents
    readme_content = """# RezNet AI Workspace

This workspace is where AI agents create and manage project files.

## Directory Structure

- **backend/** - Server-side code (@backend agent)
  - api/ - API endpoints and routes
  - models/ - Database models and schemas
  - services/ - Business logic and services

- **frontend/** - Client-side code (@frontend agent)
  - components/ - React/UI components
  - pages/ - Page-level components
  - styles/ - CSS/styling files

- **tests/** - Test files (@qa agent)
  - unit/ - Unit tests
  - integration/ - Integration tests
  - e2e/ - End-to-end tests

- **docs/** - Documentation files (all agents)

- **config/** - Configuration files (@devops agent)

- **scripts/** - Utility scripts (@devops agent)

## Guidelines for Agents

### File Creation
- Always use proper paths: `backend/api/users.py`, `frontend/components/Button.tsx`
- Create files in the appropriate directory for your role
- Include complete, working code in every file
- Add comments and documentation

### File Organization
- Backend files: Python (.py), requirements.txt, Dockerfile
- Frontend files: TypeScript (.ts, .tsx), JavaScript (.js, .jsx), CSS
- Test files: test_*.py, *.test.ts, *.spec.js
- Documentation: Markdown (.md)

### Best Practices
- One primary file per feature (can have supporting files)
- Use clear, descriptive filenames
- Follow language conventions (snake_case for Python, camelCase for JS/TS)
- Include necessary imports and dependencies
"""

    readme_path = WORKSPACE_ROOT / "README.md"
    readme_path.write_text(readme_content)
    print(f"✓ Created: README.md")

    # Create .gitkeep files to ensure empty directories are tracked
    for dir_path in directories:
        gitkeep = WORKSPACE_ROOT / dir_path / ".gitkeep"
        gitkeep.write_text("# Keep this directory in git\n")

    print(f"\n✅ Workspace structure initialized at: {WORKSPACE_ROOT}")
    print(f"📁 Created {len(directories)} directories")


if __name__ == "__main__":
    init_workspace_structure()
