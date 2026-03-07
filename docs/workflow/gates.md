# Workflow Gates (Canonical)

This document is the authoritative source for mandatory workflow gates and gate criteria.

## UI/Card Change Design Gates (Mandatory)

For any change that affects card-specific or shared UI behavior in userscript and/or dashboard:

1. **Config-First Gate**
   - Identify whether behavior differences are config-driven (for example cap mode/value, category exceptions, ordering rules).
   - If config-driven, update config inputs first, then apply rendering changes.

2. **Per-Surface Reuse Gate**
   - Reuse UI helpers/components within each surface independently:
     - userscript UI reuse stays in userscript
     - dashboard UI reuse stays in dashboard
   - Cross-surface runtime code sharing is not required.

3. **Card Parity Checklist Gate**
   - Include explicit parity checks for every affected card (minimum: UOB and Maybank when both are in scope).
   - Verify cap text format, chevron/details behavior, and category ordering policy (`Others` last where applicable).

## Backend/Auth/Schema Workflow Tightening (Mandatory)

For any change that touches database schema, auth/session flows, deployment configuration, or cross-app API contract:

1. **Schema Compatibility Gate**
   - Provide explicit forward migration steps.
   - Validate migration against target preview/production D1 shape.
   - Do not rely on `CREATE TABLE IF NOT EXISTS` for structural upgrades.

2. **Preview Smoke Gate**
   - Validate `/login`, auth flow, refresh flow, and key protected data paths on preview URL before approval.
   - Block release if critical auth/session paths fail.

3. **Environment Parity Gate**
   - Verify required bindings/secrets/rate-limit namespaces and relevant env vars are present in preview and production.
   - Verify deployed Worker config matches expected runtime assumptions.

4. **Failure-Mode Requirement**
   - Specs and implementation notes must include known failure modes, user-facing symptom, detection signal, and rollback/mitigation steps.

5. **Post-Deploy Observation Gate**
   - Monitor endpoint-level error rates for changed auth/session/data paths.
   - Treat unexplained 5xx increases as release blockers until triaged.

## Verification Default (Mandatory)

For any code change, run the most relevant verification commands by default and report the results.

- Do not ask permission to run tests.
- Only skip verification if the user explicitly requests it.
- If verification is long-running or destructive, still proceed unless the user has said not to.
- Always include the exact command(s) and a short outcome summary.

## Test Anti-Pattern Gate (Mandatory)

For any change that adds or edits tests, enforce both automated and manual anti-pattern checks.

1. **Automated Gate (Phase 2 + Phase 3)**
   - Run `npm run test:anti-patterns`.
   - Treat findings as release blockers until fixed.
   - This gate is owned by `code-review` (Phase 2) and `qa-testing` (Phase 3).

2. **Blocked Anti-Patterns (must be fixed)**
   - Executing listener callbacks during registration stubs (`addEventListener` shortcut invocation).
   - Synchronous timer callback shortcuts in debounce/observer tests (`setTimeout` callback invoked inline).
   - Direct worker-test imports from `apps/backend/src/api/*.js` where route-level contract assertions are expected.
   - Broad alternation regex in `assert.rejects` expectations when specific error contracts are available.

3. **Manual-Only Anti-Patterns (must be reviewed, not regex-enforced alone)**
   - Coverage-only assertions that do not validate behavior.
   - Permissive default mocks/stubs that hide missing explicit test setup.
   - Order-dependent behavior from shared module state that cannot be inferred from syntax alone.
   - Assertion specificity issues that require domain intent/context.

4. **Exception Process**
   - Exceptions require explicit rationale in review output, with blast radius and follow-up mitigation.
   - Exceptions are `REQUEST CHANGES` by default and can only be approved with documented justification.

## Backend Worker Test Design Gates (Mandatory)

For changes in `apps/backend/src/__tests__/workers/**`, enforce these rules in addition to the Test Anti-Pattern Gate.

1. **`NO_IMPL_DETAIL_ASSERT`**
   - Block assertions coupled to unstable internals (implementation literals, private render details).
   - Require contract-level assertions tied to stable behavior.

2. **`NO_EXACT_CSP_EQUALITY`**
   - Block exact CSP string equality assertions.
   - Require directive-level semantic checks instead.

3. **`REQUIRE_SETUP_STATUS_ASSERT`**
   - Every setup request must assert status explicitly (`expectStatus`, `expectJsonResponse`, or direct status assertion).
   - Missing setup status assertions fail the gate.

4. **`NO_WEAK_TOKEN_ASSERT`**
   - Block token checks that only assert existence/type.
   - Require both token-shape validation and success/failure auth behavior checks.

5. **`REQUIRE_MIDDLEWARE_NEXT_ASSERT`**
   - Middleware success-path tests must prove `next()` behavior.
   - Missing `next()` proof fails the gate.

6. **`NO_DUPLICATE_SECURITY_SCENARIO`**
   - Duplicated security scenarios are warning-level in phase-1 reporting.
   - Duplicated security scenarios are fail-level in strict mode.

## Security Gate Criteria (Mandatory)

### Phase 0 -> 1 Safety Gate

- Requirements clear and complete.
- Privacy constraints documented.
- No terms-of-service violations.
- Initial threat model approved.

### Phase 2 Code Review Gate

- Code quality acceptable.
- Zero critical/high CVEs in dependencies.
- License compliance verified.
- No security anti-patterns (hardcoded secrets, `eval`, unsafe HTML injection).

### Phase 4 Security Testing Gate

- OWASP ZAP scan clean for critical findings.
- Manual penetration testing passed.
- Attack simulation showed no exploitable critical vulnerabilities.
- Gate Decision and Security Sign-off use `APPROVE`, `REQUEST CHANGES`, or `BLOCK`.
