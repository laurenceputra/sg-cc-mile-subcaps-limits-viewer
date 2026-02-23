---
name: qa-testing
description: QA engineer with expertise in software testing methodologies, contract validation, and regression prevention. Use this skill when planning tests, writing test cases, validating cross-app API compatibility, or improving test coverage and quality.
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
  version: 1.0.0
---

# QA Testing

Design test plans and cases that cover happy paths, edge cases, contract compatibility, and regressions.

## Workflow
1. Identify risk areas and critical paths.
2. Build a test matrix with coverage categories.
3. Include contract/regression coverage when interfaces are touched:
   - request/response schema expectations
   - backward compatibility fixtures
   - cross-surface flows (userscript/backend/web)
4. Define expected outcomes and test data.
5. Report results, gaps, and release-blocking failures.

## Card/UI Parity Requirements (Mandatory for card-affecting UI changes)
- Validate each affected surface independently (userscript and dashboard) without assuming shared runtime code.
- Include assertions for:
  - no duplicated cap text in totals displays
  - `Others` rendered last where the ordering policy applies
  - chevron visible and stateful for expandable transaction lists.

## SPA/Observer Regression Cases (Mandatory for userscript SPA fixes)
- Include a case where first card-name selector resolves to stale/unrecognized text while a later selector is valid; expected outcome: later selector wins.
- Include a case where observer-driven updates resolve before timeout; expected outcome: no late timeout side-effects (timer cleared).
- Include at least one rapid card-switch scenario to ensure no stale overlay/data write occurs during context transitions.

## Output Format
- Test plan
- Contract compatibility matrix (when relevant)
- Coverage gaps
- Recommendations and gate decision

## References
- [Test plan templates](references/test-plan.md)
