# PRD ↔ GitHub Issues Mapping

> **Purpose**: Maps features in PRD.md to actual GitHub Issues
> **Last Updated**: 2025-10-29
> **Status**: Active alignment document

---

## Phase 2: Custom Agents & Production Hardening

### HIGH PRIORITY Features

| PRD Feature | GitHub Issue | Priority | Status | Notes |
|------------|--------------|----------|--------|-------|
| **1. Custom Agent Creation UI** | [#18](https://github.com/alexg-g/reznet-ai/issues/18) | High | Open | ✅ Perfectly aligned - UI for creating custom agents |
| **2. Agent Management UI** | [#18](https://github.com/alexg-g/reznet-ai/issues/18) | High | Open | ✅ Covered in #18 scope (edit/delete agents) |
| **3. Agent Template Library** | [#18](https://github.com/alexg-g/reznet-ai/issues/18) | High | Open | ✅ Covered in #18 - includes starter packs |
| **4. Enhanced Error Handling** | **MISSING** | High | - | ⚠️ Need to create issue |
| **5. Agent Memory & Context** | [#2](https://github.com/alexg-g/reznet-ai/issues/2) | **Low → High** | Open | ⚠️ Need to bump priority (currently Low) |
| **6. Performance Optimization** | **MISSING** | High | - | ⚠️ Need to create issue |

### MEDIUM PRIORITY Features

| PRD Feature | GitHub Issue | Priority | Status | Notes |
|------------|--------------|----------|--------|-------|
| **7. Workflow Debugging Tools** | **MISSING** | Medium | - | Consider lower priority for Phase 2 |
| **8. Multi-Channel Support** | **MISSING** | Medium | - | Consider Phase 3 |
| **9. File Upload & Preview** | **MISSING** | Medium | - | Nice to have |
| **10. Enhanced Orchestrator** | **MISSING** | Medium | - | Incremental improvements |

### LOW PRIORITY Features

| PRD Feature | GitHub Issue | Priority | Status | Notes |
|------------|--------------|----------|--------|-------|
| **11. Agent Prompt Suggestions** | **MISSING** | Low | - | Future enhancement |
| **12. Model Comparison View** | **MISSING** | Low | - | Future enhancement |
| **13. Voice Input** | [#4](https://github.com/alexg-g/reznet-ai/issues/4) | Low | Open | ✅ Aligned |
| **14. Export & Sharing** | [#19](https://github.com/alexg-g/reznet-ai/issues/19) | **Low → Medium** | Open | ✅ Agent Export/Import feature |

---

## Additional High-Priority Issues NOT in PRD

These are HIGH PRIORITY issues that should be added to PRD Phase 2:

| GitHub Issue | Title | Priority | Suggested PRD Section |
|--------------|-------|----------|----------------------|
| [#14](https://github.com/alexg-g/reznet-ai/issues/14) | Real-time Workflow Progress Visualization | High | **Add to Phase 2 High Priority** |
| [#13](https://github.com/alexg-g/reznet-ai/issues/13) | GitHub Integration - PRs and Branches | High | **Add to Phase 2 High Priority** |
| [#12](https://github.com/alexg-g/reznet-ai/issues/12) | Code Execution Sandbox | High | **Add to Phase 2 High Priority** |
| [#11](https://github.com/alexg-g/reznet-ai/issues/11) | Pre-built Demo Workflows | High | **Add to Phase 2 High Priority** |

---

## All Open Issues by Priority

### High Priority (8 issues)
1. [#18](https://github.com/alexg-g/reznet-ai/issues/18) - Agent Template System ✅ **IN PRD**
2. [#14](https://github.com/alexg-g/reznet-ai/issues/14) - Workflow Progress Visualization ⚠️ **ADD TO PRD**
3. [#13](https://github.com/alexg-g/reznet-ai/issues/13) - GitHub Integration (PRs/Branches) ⚠️ **ADD TO PRD**
4. [#12](https://github.com/alexg-g/reznet-ai/issues/12) - Code Execution Sandbox ⚠️ **ADD TO PRD**
5. [#11](https://github.com/alexg-g/reznet-ai/issues/11) - Pre-built Demo Workflows ⚠️ **ADD TO PRD**
6. **MISSING** - Enhanced Error Handling ⚠️ **CREATE ISSUE**
7. **MISSING** - Performance Optimization ⚠️ **CREATE ISSUE**
8. [#2](https://github.com/alexg-g/reznet-ai/issues/2) - Agent Memory (RAG) - **Bump to High**

### Medium Priority (3 issues)
1. [#10](https://github.com/alexg-g/reznet-ai/issues/10) - Task Cancellation
2. [#8](https://github.com/alexg-g/reznet-ai/issues/8) - Usage Statistics Dashboard
3. [#15](https://github.com/alexg-g/reznet-ai/issues/15) - LLM Provider UI Toggle

### Low Priority (6 issues)
1. [#21](https://github.com/alexg-g/reznet-ai/issues/21) - Agent Efficiency (Prompt Caching)
2. [#20](https://github.com/alexg-g/reznet-ai/issues/20) - Documentation Guide
3. [#19](https://github.com/alexg-g/reznet-ai/issues/19) - Agent Export/Import - **Bump to Medium**
4. [#9](https://github.com/alexg-g/reznet-ai/issues/9) - Web Search Integration
5. [#7](https://github.com/alexg-g/reznet-ai/issues/7) - Message Threading
6. [#4](https://github.com/alexg-g/reznet-ai/issues/4) - Voice Input
7. [#3](https://github.com/alexg-g/reznet-ai/issues/3) - Database MCP Server
8. [#2](https://github.com/alexg-g/reznet-ai/issues/2) - pgvector/RAG Memory - **Bump to High**

---

## Recommended Actions

### 1. Update PRD Roadmap
Add these HIGH PRIORITY features to Phase 2:
- ✅ #18 - Custom Agent Creation (already in PRD)
- ➕ #14 - Workflow Progress Visualization
- ➕ #13 - GitHub PR/Branch Creation
- ➕ #12 - Code Execution Sandbox
- ➕ #11 - Pre-built Demo Workflows
- ➕ #2 - Agent Memory/RAG (bump from Low)

### 2. Create Missing Issues
Create GitHub Issues for PRD items without issues:
- Enhanced Error Handling & Recovery
- Performance Optimization (< 3s response time)
- Workflow Debugging Tools
- Multi-Channel Support

### 3. Adjust Priorities
- **Bump to High**: #2 (Agent Memory/RAG)
- **Bump to Medium**: #19 (Agent Export/Import), #20 (Documentation)

### 4. Phase 2 Core Focus
Based on actual issues, Phase 2 should prioritize:

**Tier 1 (Must Have)**:
1. Custom Agent Creation (#18) 🎯 **CORE FEATURE**
2. Agent Memory/RAG (#2)
3. Workflow Visualization (#14) - makes demo compelling
4. Error Handling (create issue)
5. Performance (create issue)

**Tier 2 (Should Have)**:
6. GitHub Integration (#13) - production workflow
7. Code Execution Sandbox (#12) - safety
8. Demo Workflows (#11) - onboarding
9. Agent Export/Import (#19) - sharing
10. LLM Provider UI (#15) - visibility

**Tier 3 (Nice to Have)**:
11. Task Cancellation (#10)
12. Usage Dashboard (#8)
13. Documentation Guide (#20)

---

## Next Steps

1. **Update PRD.md** with actual GitHub Issue links
2. **Create missing issues** for PRD features
3. **Adjust issue priorities** to match PRD
4. **Create GitHub Milestone** for Phase 2
5. **Assign issues to milestones**

---

*This mapping document should be updated whenever PRD or issues change.*
