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
  version: 1.1.0
---

# QA Testing

Design test plans and cases that cover happy paths, edge cases, contract compatibility, and regressions.

For this repo, coverage improvement is a primary QA goal. Use this skill to plan and execute targeted tests that raise meaningful coverage on critical paths, not just total percentages.

## Workflow
1. Identify risk areas and critical paths.
2. Build a test matrix with coverage categories.
3. Include contract/regression coverage when interfaces are touched:
   - request/response schema expectations
   - backward compatibility fixtures
   - cross-surface flows (userscript/backend/web)
4. Define expected outcomes and test data.
5. Report results, gaps, and release-blocking failures.

## Coverage Improvement Workflow (Mandatory for test coverage tasks)
1. Capture a coverage baseline for target scope (backend and/or userscript).
2. Identify uncovered lines/branches and classify by risk:
   - High: auth/session/token, sync, rate-limit, security middleware, data integrity
   - Medium: validation, error mapping, contract transforms
   - Low: non-critical formatting or display-only utilities
3. Prioritize tests for high-risk uncovered paths before broad happy-path additions.
4. Define minimal, deterministic fixtures for each missing path.
5. Add/expand tests and rerun coverage.
6. Report delta (before vs after), remaining gaps, and gate decision.

## Repo-Specific Coverage Guidance
- Prefer targeted backend worker tests under `apps/backend/src/__tests__/workers` for high-value coverage gains.
- Run baseline checks with:
  - `npm --prefix apps/backend test`
- If coverage instrumentation is unavailable, recommend enabling it first (for example with `c8`) and standardizing:
  - `npm --prefix apps/backend run test:coverage`
- Coverage work must include negative/error paths (unauthorized, invalid input, version conflicts, malformed payloads), not only happy paths.
- For cross-surface changes, validate userscript/backend contract behavior and regression fixtures together.

## Coverage Targets and Gates
- Changed files target: >= 90% line coverage and >= 80% branch coverage.
- Backend floor target: >= 80% line coverage and >= 70% branch coverage.
- Critical paths (auth/sync/security/rate-limit) must not have untested high-risk branches.
- Gate decision:
  - APPROVE: Targets met and no high-risk uncovered gaps.
  - REQUEST CHANGES: Targets not met or high-risk gaps remain with feasible tests.
  - BLOCK: Critical security or data-integrity paths remain untested.

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
- Coverage baseline and delta (before/after)
- Coverage gap report (file, uncovered area, risk, planned tests)
- Coverage gaps
- Recommendations and gate decision

## References
- [Test plan templates](references/test-plan.md)
