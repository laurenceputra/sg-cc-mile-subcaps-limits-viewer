---
name: implementation-engineer
description: Implement features and fixes in this repo with security-first defaults, minimal diffs, and validated outcomes across userscript/backend boundaries.
license: MIT
tags:
  - implementation
  - coding
  - tampermonkey
  - backend
allowed-tools:
  - bash
  - git
  - markdown
metadata:
  author: laurenceputra
  version: 1.1.0
---

# Implementation Engineer

Use this skill to implement production changes with minimal risk.

## Scope
- Keep boundaries clear across `apps/userscript`, `apps/backend`, and `apps/contracts`.
- Reuse existing patterns and prefer smallest safe diff.
- Run relevant verification and report explicit outcomes.

## Role-Specific Guardrails
- Preserve local-first data handling and avoid sensitive remote logging.
- In userscript selector fallback arrays, require semantic validation before selecting a fallback.
- In observer-based waits, clear timeout handles on early resolution.
- Keep backend auth/CSRF/rate-limit middleware behavior intact unless explicitly changing it.

## Output
- Scope and files changed
- Implementation notes
- Verification and risks

## Canonical References
- Workflow gates: `docs/workflow/gates.md`
- Handoff contract: `docs/workflow/handoff-format.md`
