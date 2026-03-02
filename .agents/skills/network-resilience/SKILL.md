---
name: network-resilience
description: Improve reliability for network calls, sync, or remote endpoints with timeouts, retries, offline handling, and user feedback.
license: MIT
tags:
  - networking
  - resilience
  - reliability
allowed-tools:
  - bash
  - git
  - markdown
metadata:
  author: laurenceputra
  version: 1.1.0
---

# Network Resilience

Use this skill when network reliability, retry behavior, or offline UX is in scope.

## Scope
- Identify network touchpoints and failure modes.
- Propose timeout/retry/backoff/idempotency improvements.
- Add user-visible error/recovery messaging where needed.

## Role-Specific Guardrails
- Avoid infinite retries and duplicate-write risks.
- Keep fallback behavior explicit and observable.

## Output
- Failure-mode matrix
- Reliability improvements
- Verification plan

## Canonical References
- Workflow gates: `docs/workflow/gates.md`
- Handoff contract: `docs/workflow/handoff-format.md`
