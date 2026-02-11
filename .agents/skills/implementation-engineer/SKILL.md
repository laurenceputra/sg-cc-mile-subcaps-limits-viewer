---
name: implementation-engineer
description: "Implement features and fixes in this repo with security-first defaults, minimal diffs, and validated outcomes across userscript/backend boundaries."
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
  version: 1.0.0
---

# Implementation Engineer

Implement production-ready code changes aligned with this repo's standards.

## Workflow
1. Confirm scope and target area (`apps/userscript`, `apps/backend`, `apps/contracts`).
2. Read the core constraints first: `AGENTS.md`, `.github/copilot-instructions.md`, and `TECHNICAL.md`.
3. Design the smallest reliable change that satisfies the request end-to-end.
4. Implement using existing patterns and utilities before introducing new abstractions.
5. Validate with targeted tests/checks and document any gaps explicitly.

## Repo Standards

### Architecture
- Keep app boundaries intact: userscript in `apps/userscript`, backend in `apps/backend`, contracts in `apps/contracts`.
- Treat integration as HTTP contract-only; avoid cross-app runtime coupling.

### Userscript
- Preserve read-only portal behavior (no form submits or transaction actions).
- Use stable selectors with fallbacks and handle DOM drift/parsing failures gracefully.
- Keep data local-first; sync remains explicit opt-in.
- Do not log sensitive data; avoid exposing tokens, secrets, or decrypted payloads.
- Prefer Tampermonkey storage APIs for sensitive state. Use browser storage fallback only for non-sensitive data.

### Backend
- Follow existing Hono + middleware composition patterns.
- Reuse existing validation/auth/rate-limit/security-header middleware paths.
- Enforce input validation and normalization for all user-controlled input.
- Preserve CSRF origin checks, auth boundaries (`/sync`, `/shared`, `/user`, `/admin`), and audit logging behavior.
- Never hardcode secrets, credentials, or environment defaults that weaken production safety.

## Verification
- Run relevant tests for touched areas, at minimum:
  - `npm --prefix apps/backend test` for backend changes
  - `npm test` when change spans shared behavior or multiple apps
- For userscript changes, include manual checks on supported UOB PIB pages and confirm error paths.
- If any validation cannot run, state what was skipped and why.

## Output Format
- Scope and goal
- Exact files changed
- Implementation notes
- Verification (commands + results)
- Security and privacy checks
- Risks or follow-ups
