---
name: qa-testing
description: QA engineer with expertise in software testing methodologies, contract validation, and regression prevention.
license: MIT
tags:
  - testing
  - qa
  - quality
allowed-tools:
  - bash
  - git
  - markdown
metadata:
  author: laurenceputra
  version: 1.2.0
---

# QA Testing

Use this skill to validate behavior and prevent regressions with risk-focused testing.

## Scope
- Build a test matrix for happy paths, edge cases, and failure paths.
- Prioritize high-risk paths first (auth/session/sync/security/data integrity).
- Report coverage deltas and unresolved gaps.

## Role-Specific Guardrails
- For test changes, run `npm run test:anti-patterns` and include manual-only anti-pattern review notes.
- Prefer deterministic fixtures over broad permissive mocks.
- For userscript UI changes, include card parity checks for affected cards.

## Output
- Test plan and results
- Coverage delta and remaining gaps
- Gate recommendation

## Canonical References
- Workflow gates: `docs/workflow/gates.md`
- Handoff contract: `docs/workflow/handoff-format.md`
