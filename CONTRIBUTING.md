# Contributing to RezNet AI

Thank you for your interest in contributing to RezNet AI! We're building a platform for multi-agent AI collaboration, and we welcome contributions from developers of all skill levels.

## 🤝 How to Contribute

There are many ways to contribute to RezNet AI:

- **Report bugs** - Found something broken? Let us know!
- **Suggest features** - Have an idea? Open an issue to discuss it
- **Improve documentation** - Help make our docs clearer
- **Write code** - Fix bugs or implement new features
- **Create agent templates** - Design agents for new domains (marketing, legal, research, etc.)

## 🚀 Getting Started

### Prerequisites

Before contributing code, make sure you have:
- Python 3.11+ installed
- Node.js 18+ installed
- Docker Desktop (for PostgreSQL + Redis)
- Git configured with your GitHub account

### Development Setup

1. **Fork the repository** on GitHub

2. **Clone your fork**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/reznet-ai.git
   cd reznet-ai
   ```

3. **Add upstream remote**:
   ```bash
   git remote add upstream https://github.com/alexg-g/reznet-ai.git
   ```

4. **Run the setup script**:
   ```bash
   ./scripts/setup.sh
   ```

5. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## 📝 Pull Request Guidelines

### Before Submitting

- [ ] **Test your changes** - Make sure everything works
- [ ] **Update documentation** - Add/update docs for new features
- [ ] **Follow code style** - Use consistent formatting (see below)
- [ ] **Keep PRs focused** - One feature/fix per PR
- [ ] **Write clear commit messages** - Explain what and why

### Pull Request Process

1. **Push your changes** to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Open a Pull Request** from your fork to `alexg-g/reznet-ai:main`

3. **Describe your changes** in the PR description:
   - What problem does this solve?
   - How did you test it?
   - Any breaking changes?
   - Screenshots (if UI changes)

4. **Wait for review** - Maintainers will review and provide feedback

5. **Address feedback** - Make requested changes if needed

6. **Merge** - Once approved, your PR will be merged!

## 🎨 Code Style Guidelines

### Python (Backend)

- **PEP 8** - Follow Python style guide
- **Type hints** - Use type annotations for all functions
- **Docstrings** - Document classes and functions
- **Async** - Use async/await for I/O operations
- **Imports** - Organize: stdlib, third-party, local

Example:
```python
async def create_agent(
    name: str,
    role: str,
    system_prompt: str
) -> Agent:
    """Create a new AI agent.

    Args:
        name: Agent identifier (e.g., "backend")
        role: Agent's role description
        system_prompt: System prompt template

    Returns:
        The created Agent instance
    """
    # Implementation
```

**Run linters**:
```bash
cd backend
ruff check .
mypy .
```

### TypeScript/React (Frontend)

- **TypeScript strict mode** - Enable strict type checking
- **Functional components** - Use hooks, not class components
- **Tailwind CSS** - Use utility classes, not custom CSS
- **Consistent naming** - camelCase for variables, PascalCase for components

Example:
```typescript
interface AgentCardProps {
  agent: Agent;
  onClick: (id: string) => void;
}

export const AgentCard: React.FC<AgentCardProps> = ({ agent, onClick }) => {
  return (
    <div className="rounded-lg border p-4 hover:border-primary">
      <h3 className="font-bold">{agent.name}</h3>
      <p className="text-sm text-gray-600">{agent.role}</p>
    </div>
  );
};
```

**Run linters**:
```bash
cd frontend
npm run lint
npm run type-check
```

### Git Commit Messages

Use clear, descriptive commit messages:

```
Add: New feature description
Fix: Bug fix description
Update: Change to existing feature
Refactor: Code restructuring (no functional changes)
Docs: Documentation updates
Test: Test additions or modifications
```

Examples:
- `Add: Agent template creation UI`
- `Fix: WebSocket reconnection on network failure`
- `Update: Improve orchestrator task delegation logic`
- `Docs: Add agent design guide to README`

## 🐛 Reporting Bugs

Found a bug? Help us fix it!

### Before Reporting

1. **Search existing issues** - Has it been reported already?
2. **Try the latest version** - Is it still broken?
3. **Minimal reproduction** - Can you isolate the problem?

### Bug Report Template

```markdown
**Describe the bug**
A clear description of what's broken.

**To Reproduce**
Steps to reproduce:
1. Go to '...'
2. Click on '...'
3. See error

**Expected behavior**
What should happen instead?

**Environment:**
 - OS: [e.g. macOS 14.0]
 - Python version: [e.g. 3.11.5]
 - LLM Provider: [e.g. Anthropic, OpenAI, Ollama]
 - Node version: [e.g. 18.17.0]

**Logs/Screenshots**
Add any error messages or screenshots.
```

## 💡 Suggesting Features

Have an idea? We'd love to hear it!

### Feature Request Template

```markdown
**Problem**
What problem would this feature solve?

**Proposed Solution**
How would you implement it?

**Alternatives**
Are there other ways to solve this?

**Additional Context**
Any mockups, examples, or references?
```

## 🧪 Testing

### Running Tests

```bash
# Backend tests
cd backend
pytest tests/

# Frontend tests
cd frontend
npm test
```

### Writing Tests

- **Unit tests** - Test individual functions/components
- **Integration tests** - Test feature workflows
- **Test edge cases** - Don't just test the happy path

## 📚 Documentation

Documentation lives in multiple places:

- **README.md** - Getting started guide
- **CLAUDE.md** - Project architecture and context
- **`/docs`** - Detailed guides (agent design, etc.)
- **Code comments** - Inline explanations
- **API docs** - Auto-generated from code

When adding features, update relevant docs!

## 🏷️ Issue Labels

We use labels to organize issues:

- `bug` - Something's broken
- `enhancement` - New feature request
- `documentation` - Docs improvements
- `good first issue` - Great for newcomers!
- `help wanted` - Need community input
- `question` - General questions

## ❓ Questions?

Not sure about something? Ask!

- **Open a Discussion** - [GitHub Discussions](https://github.com/alexg-g/reznet-ai/discussions)
- **Ask in an Issue** - We'll help you get started
- **Check the docs** - [README](README.md) and [CLAUDE.md](CLAUDE.md)

## 📜 Code of Conduct

Be respectful, inclusive, and constructive. We're all here to build something great together.

- **Be kind** - Treat others with respect
- **Be constructive** - Focus on solutions
- **Be inclusive** - Welcome diverse perspectives
- **Be patient** - Everyone was new once

## 🙏 Thank You!

Every contribution, no matter how small, helps make RezNet AI better. We appreciate your time and effort!

---

**Happy coding!** 🚀
