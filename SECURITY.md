# Security Policy

## Recent Security Updates

**2025-10-28**: Security audit completed before public release
- ✅ Removed all vulnerable dependencies (python-jose, lancedb)
- ✅ Zero known vulnerabilities (verified with pip-audit)
- ✅ Dependabot enabled for automated dependency monitoring
- ✅ All secrets properly gitignored and not committed to repository

## Supported Versions

We release patches for security vulnerabilities in the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

**Please DO NOT report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability in RezNet AI, please report it responsibly:

### How to Report

1. **Email**: Send details to **security@purekarmalabs.com**
2. **Include**:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if you have one)

### What to Expect

- **Initial Response**: Within 48 hours
- **Status Update**: Every 7 days until resolved
- **Fix Timeline**: Depends on severity
  - **Critical**: 1-3 days
  - **High**: 1-2 weeks
  - **Medium**: 2-4 weeks
  - **Low**: Next release cycle

### Our Commitment

- We'll work with you to understand and resolve the issue
- We'll keep you updated on our progress
- We'll credit you in the security advisory (unless you prefer anonymity)
- We won't take legal action against good-faith security researchers

## Security Best Practices

When using RezNet AI, follow these security guidelines:

### Environment Variables

**Never commit `.env` files to git**

```bash
# ❌ NEVER do this
git add .env
git commit -m "Add config"

# ✅ Use .env.example instead
cp .env.example .env
# Edit .env with your secrets
```

### API Keys

- **Rotate regularly** - Change API keys every 90 days
- **Use environment variables** - Never hardcode keys
- **Minimum permissions** - Use least-privilege principle
- **Monitor usage** - Check for unusual activity

### LLM Provider Security

**Anthropic API Keys**:
- Never share your API key
- Rotate if potentially exposed
- Monitor usage at console.anthropic.com

**OpenAI API Keys**:
- Use organization-scoped keys when possible
- Set usage limits to prevent abuse
- Monitor at platform.openai.com

### MCP Server Security

**Filesystem Server**:
- Restrict workspace directory to project files only
- Never expose entire filesystem
- Use absolute paths in configuration
- Review file operations in logs

**GitHub Server**:
- Use personal access token (PAT) with minimal scopes:
  - `repo` for private repos (or `public_repo` for public only)
  - Avoid full `admin` access
- Rotate tokens regularly
- Use fine-grained tokens when available

### Network Security

**Local Development**:
- RezNet AI runs on `localhost` by default (not exposed to internet)
- Don't bind to `0.0.0.0` unless you understand the risks
- Use firewall rules to block external access

**Production Deployment** (Future):
- Use HTTPS/TLS encryption
- Implement authentication (currently disabled for local MVP)
- Use secure WebSocket (wss://)
- Enable CORS only for trusted origins

### Database Security

**PostgreSQL**:
```sql
-- Use strong passwords
-- Don't use default credentials
CREATE USER reznet WITH PASSWORD 'use-a-strong-password-here';
```

**Redis**:
- Enable authentication (`requirepass` in redis.conf)
- Bind to localhost only
- Use TLS for remote connections

### Docker Security

- Keep images updated: `docker-compose pull`
- Don't run containers as root
- Limit container resources
- Use secrets management (not environment variables) in production

### Code Execution

**Agent capabilities**:
- Agents can execute code via MCP servers
- Review agent system prompts carefully
- Limit filesystem access to workspace only
- Monitor agent actions in production

**Prompt Injection**:
- Be cautious with untrusted input to agents
- Sanitize user input before sending to LLMs
- Don't include secrets in prompts

## Known Issues

### Current Security Limitations (MVP)

1. **No Authentication** - Local MVP has no auth (single-user only)
2. **No Rate Limiting** - API has no rate limits
3. **No Audit Logging** - Actions aren't logged for security review
4. **No Input Validation** - Limited validation on user input
5. **No Secrets Management** - Secrets stored in `.env` files

**These will be addressed in future releases before production deployment.**

## Security Checklist for Contributors

When contributing code, ensure:

- [ ] No hardcoded secrets or API keys
- [ ] `.env` files are in `.gitignore`
- [ ] User input is validated and sanitized
- [ ] SQL queries use parameterization (no string interpolation)
- [ ] File paths are validated (no directory traversal)
- [ ] Dependencies are up-to-date (no known CVEs)
- [ ] Authentication checks are present (when auth is added)
- [ ] Error messages don't leak sensitive information

## Dependency Security

### Automated Scanning

We use automated tools to scan for vulnerabilities:

**Python**:
```bash
# Run pip-audit (recommended)
cd backend && source venv/bin/activate
pip-audit --desc

# Run with stricter mode (fails on any vulnerability)
pip-audit --strict
```

**Node.js**:
```bash
# Check for vulnerabilities
npm audit

# Fix automatically
npm audit fix
```

**Dependabot**:
We use GitHub Dependabot for automated dependency updates:
- Checks for security vulnerabilities daily
- Opens PRs for dependency updates weekly
- Groups related updates to reduce noise
- Configured in `.github/dependabot.yml`

### Update Policy

- **Critical vulnerabilities**: Patch immediately
- **High vulnerabilities**: Patch within 7 days
- **Medium vulnerabilities**: Patch in next release
- **Low vulnerabilities**: Address opportunistically

## Disclosure Policy

### Coordinated Disclosure

We follow coordinated vulnerability disclosure:

1. **Day 0**: Vulnerability reported
2. **Day 1-2**: We confirm and assess severity
3. **Day 3-30**: We develop and test a fix
4. **Day 30**: Public disclosure (or when fix is released)

### Security Advisories

- Published on [GitHub Security Advisories](https://github.com/alexg-g/reznet-ai/security/advisories)
- CVE requested for critical vulnerabilities
- Credit given to reporters (unless anonymous)

## Contact

**Security Team**: security@purekarmalabs.com
**PGP Key**: (Coming soon)

---

**Thank you for helping keep RezNet AI secure!** 🔒
