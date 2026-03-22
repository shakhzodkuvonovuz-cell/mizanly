---
name: Subagent context quality
description: Always use Opus for subagents. Give them FULL context (file paths, line numbers, schema details, code snippets, rules) — not just brief descriptions. Context = quality.
type: feedback
---

Always use Opus model for subagents. Never Sonnet or Haiku.

Subagents consistently produce poor work when given brief prompts. The orchestrator has 100K+ tokens of context but typically gives agents only a few hundred tokens — leading to wrong assumptions, missed patterns, and buggy fixes.

**Why:** Agents lack the conversation context. They don't know the schema, the code conventions, the rules from CLAUDE.md, or what's already been tried. Without this, they guess — and guess wrong.

**How to apply:** Every subagent prompt MUST include:
1. Exact file paths with line numbers for every file they need to touch
2. The actual code snippets they need to modify (not just descriptions)
3. Schema field names and types when relevant
4. CLAUDE.md rules that apply to their work
5. What the expected output looks like
6. What NOT to do (common mistakes)
7. How to verify their work (run tsc, run tests)

10 agents at a time maximum. Audit each agent's work immediately when it returns — don't batch review.

**CRITICAL: Verify every agent's outcome against requirements.**
After each agent returns, the orchestrator MUST:
1. Run `grep` / `read` to verify the actual files were changed correctly — don't trust agent's summary
2. Run `tsc --noEmit` to verify 0 TS errors remain
3. Run `jest` to verify 0 test failures
4. Spot-check at least 2-3 of the agent's changes by reading the actual file
5. If agent claims "no changes needed" or "already done", verify independently with grep/read
6. Cross-reference against the audit findings — did the agent fix ALL items assigned, not just some?

The deployment audit agent claimed ".env is tracked by git" — this was FALSE. The gamification prefix agent was asked to fix empty @Controller() — turned out it was CORRECT as-is. Trust but verify.
