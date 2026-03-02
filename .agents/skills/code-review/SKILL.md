---
name: code-review
description: Expert code reviewer with deep knowledge of software engineering best practices, design patterns, and code quality standards.
license: MIT
tags:
  - code-review
  - quality
  - best-practices
allowed-tools:
  - bash
  - git
  - markdown
metadata:
  author: laurenceputra
  version: 1.1.0
---

# Code Review

Use this skill to review correctness, maintainability, and dependency/test risks for a change set.

## Scope
- Validate behavior against stated intent.
- Flag regressions, fragile logic, and missing tests.
- Run dependency/license checks when relevant.

## Role-Specific Guardrails
- For userscript selector fallback arrays, require semantic validation before accepting a selector result.
- For observer + timeout helpers, verify timer cleanup on early resolve and teardown.
- For tests changed in scope, run `npm run test:anti-patterns` and report manual-only anti-pattern findings.

## Output
- Findings by severity
- Suggested fixes
- Verification and anti-pattern results

## Canonical References
- Workflow gates: `docs/workflow/gates.md`
- Handoff contract: `docs/workflow/handoff-format.md`
