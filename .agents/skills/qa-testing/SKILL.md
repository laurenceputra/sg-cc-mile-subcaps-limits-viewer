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

## Repo-Specific Coverage Guidance
- Prefer targeted backend worker tests under `apps/backend/src/__tests__/workers` for high-value coverage gains.
- Run baseline checks with:
  - `npm --prefix apps/backend test`
- If coverage instrumentation is unavailable, recommend enabling it first (for example with `c8`) and standardizing:
  - `npm --prefix apps/backend run test:coverage`
- Coverage work must include negative/error paths (unauthorized, invalid input, version conflicts, malformed payloads), not only happy paths.
- For cross-surface changes, validate userscript/backend contract behavior and regression fixtures together.

## Userscript Coverage Requirements (Mandatory)
- Coverage thresholds (userscript scope): `lines: 30`, `functions: 35`, `branches: 78`.
- Test location: `apps/userscript/__tests__/*.test.js`.
- Loader usage: tests must import `apps/userscript/__tests__/helpers/load-userscript-exports.js` and call `await loadExports()` before using exports.
- Mocking guidance: stub `globalThis.fetch`, `window.localStorage`, `document`, `GM_*` helpers (`GM_getValue`, `GM_setValue`, `GM_addStyle`, `GM_xmlhttpRequest`), and set `globalThis.__CC_SUBCAP_TEST__ = true` when importing the userscript.
- Test naming & granularity: prefer small unit tests for pure helpers and a few small integration tests for initialization and DOM wiring; avoid large monolithic tests.
- Coverage enforcement recommendation: add `c8` and a `check-coverage` step to gate thresholds.
  - Example: `npm i -D c8`
  - Example: `npx c8 --reporter=text --reporter=lcov node --test --experimental-test-coverage apps/userscript/__tests__/*.test.js`
  - Example: `npx c8 check-coverage --lines 30 --functions 35 --branches 78`

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

## Test Anti-Pattern Review (Mandatory when tests change)
- Run `npm run test:anti-patterns` and treat findings as blockers.
- Manual-only checks that must be explicitly reviewed:
  - coverage-only assertions with weak behavioral guarantees
  - permissive default mocks/stubs that hide missing explicit setup
  - order-dependent behavior from shared module/module-cache state
  - vague error assertions when a stable contract allows specific matching
- Report both:
  - automated result (`pass`/`fail`, finding count)
  - manual anti-pattern assessment (`none found` or concrete issues)

## Mandatory Test Anti-Pattern Check (backend worker tests)
- Validate backend worker tests against:
  - `NO_IMPL_DETAIL_ASSERT`
  - `NO_EXACT_CSP_EQUALITY`
  - `REQUIRE_SETUP_STATUS_ASSERT`
  - `NO_WEAK_TOKEN_ASSERT`
  - `REQUIRE_MIDDLEWARE_NEXT_ASSERT`
  - `NO_DUPLICATE_SECURITY_SCENARIO` (report-only in phase 1; fail in strict phase)
- Record pass/fail and evidence (rule ID + file:line).
- Any fail-level finding is a release-blocking QA gate failure.

## Output Format
- Test plan
- Contract compatibility matrix (when relevant)
- Coverage baseline and delta (before/after)
- Coverage gap report (file, uncovered area, risk, planned tests)
- Coverage gaps
- Recommendation and Gate Decision
- Test Anti-Pattern Check

## Canonical References
- Workflow gates: `docs/workflow/gates.md`
- Handoff contract: `docs/workflow/handoff-format.md`

## References
- [Test plan templates](references/test-plan.md)
