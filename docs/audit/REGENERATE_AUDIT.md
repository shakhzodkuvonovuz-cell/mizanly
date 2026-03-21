# How to Regenerate the Full 67-Agent Audit

The complete raw findings from all 67 agents exist in the Claude Code conversation from March 21, 2026 but couldn't be written to disk in full due to context limits.

## What exists now:
- `docs/audit/DEEP_AUDIT_INDEX_2026_MARCH21.md` — Complete index with all 67 agent scopes, finding counts, and top criticals
- `docs/audit/DEEP_AUDIT_67_AGENTS_RAW.md` — 39 agents' verified findings (re-confirmed by reading source), ~40K chars

## To get the full raw output:

### Option 1: Re-run in a new session
Start a new Claude Code session and paste:

```
Read docs/audit/DEEP_AUDIT_INDEX_2026_MARCH21.md for the full list of 67 audit agents.
Re-run ALL 67 agents with the same scopes described in the index.
Write each agent's output to docs/audit/agents/NN-agent-name.md as it completes.
Spawn in batches of 15-20 to stay within limits.
```

### Option 2: Re-run only the missing screen audits
The backend agents (1-21) and infrastructure agents (22-33) are already well-covered in the existing RAW file. The missing ones are the 20 per-screen mobile audits. Run:

```
Read docs/audit/DEEP_AUDIT_67_AGENTS_RAW.md — this covers agents 1-33 and a few screen agents.
Re-run ONLY the screen-specific mobile audit agents (agents 34-53) from the index.
Each agent should audit 7-15 specific screen files listed in the index.
Write results to docs/audit/agents/34-auth-onboarding-screens.md etc.
```

### The prompts for each agent are documented in the index file's agent descriptions.
