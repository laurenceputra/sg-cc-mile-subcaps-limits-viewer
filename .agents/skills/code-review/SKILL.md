---
name: code-review
description: Expert code reviewer with deep knowledge of software engineering best practices, design patterns, and code quality standards. Use this skill when reviewing code changes, pull requests, or conducting code quality assessments.
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
  version: 1.0.0
---

# Code Review

Provide structured, actionable review feedback focused on correctness, security, performance, and maintainability.

## Workflow
1. Read the change and understand intent.
2. Review for correctness, edge cases, and regressions.
3. Check repo-specific constraints and testing coverage.
4. Summarize findings using the output template.

## Mandatory Heuristics (Userscript/SPA)
- For fallback selector arrays, verify the code only accepts semantically valid matches (for example known card name) and does not short-circuit on the first visible node.
- For Promise + observer wait patterns, verify timeout handles are cleared on success and cleanup paths disconnect observers + timers.
- For context-preserving teardown paths, verify state resets and observer preservation cannot create stale-write or stale-overlay windows.

## Test Anti-Pattern Gate (Mandatory when tests change)
- Run `npm run test:anti-patterns` and treat failures as blockers.
- Review and report manual-only anti-patterns even when the script passes:
  - coverage-only assertions that do not verify behavior
  - permissive defaults in mocks/stubs that hide missing setup
  - order-dependent behavior from shared module state
  - broad/ambiguous error assertions when specific contracts exist
- If an exception is proposed, require rationale + blast radius + follow-up mitigation.

## Output Format
- Summary
- Critical Issues
- Suggestions
- Testing

## References
- [Review guidelines and checklist](references/review-guidelines.md)
