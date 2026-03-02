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

## Mandatory Test Anti-Pattern Check (backend worker tests)
- Check `apps/backend/src/__tests__/workers/**` for all gate rules:
  - `NO_IMPL_DETAIL_ASSERT`
  - `NO_EXACT_CSP_EQUALITY`
  - `REQUIRE_SETUP_STATUS_ASSERT`
  - `NO_WEAK_TOKEN_ASSERT`
  - `REQUIRE_MIDDLEWARE_NEXT_ASSERT`
  - `NO_DUPLICATE_SECURITY_SCENARIO` (report in phase 1, fail in strict phase)
- If any fail-level rule is present, return **REQUEST CHANGES**.
- Include evidence as rule ID + file:line for each finding.

## Output Format
- Summary
- Critical Issues
- Suggestions
- Testing
- Test Anti-Pattern Check

## References
- [Review guidelines and checklist](references/review-guidelines.md)
