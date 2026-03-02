# Agents Workflow (Simplified and Security-First)

This repo uses a security-first, local-first workflow for a Tampermonkey userscript and optional backend sync.

## Canonical Workflow Docs

- Mandatory gates: `docs/workflow/gates.md`
- Authoritative handoff contract: `docs/workflow/handoff-format.md`
- Skill catalog and classification: `.agents/skills/README.md`

Moved policy sections:

- UI/card design gates moved to `docs/workflow/gates.md`.
- Backend/auth/schema tightening gates moved to `docs/workflow/gates.md`.
- Verification default and test anti-pattern gate moved to `docs/workflow/gates.md`.
- Security gate criteria moved to `docs/workflow/gates.md`.
- Handoff template moved to `docs/workflow/handoff-format.md`.

## Core Principle

"Security is not a phase; it is a practice."

- Default to local-first behavior for data handling and processing.
- Optional remote sync/auth is allowed only when explicitly approved, encrypted, and aligned with repo privacy constraints.
- Remote logging of sensitive data is prohibited.

## Simplified Workflow (6 Agents)

Phase ownership and gate authority:

1. Phase 0 -> 1 Safety Gate: `requirements-analyst` + `security-reviewer`
2. Phase 1 Implementation: `implementation-engineer`
3. Phase 2 Code Review Gate: `code-reviewer` + `security-reviewer`
4. Phase 3 Quality Validation: `quality-validator`
5. Phase 4 Security Testing Gate: `security-reviewer`
6. Phase 5 Documentation (optional): `documentation-writer`
7. Phase 6 Maintenance and Release Readiness: `release-management` (primary), `code-review` + `security-risk` (supporting)

## Skills Directory

Keep this table in sync with `.agents/skills/`.

| Skill | Summary | Link |
| --- | --- | --- |
| code-review | Review correctness, maintainability, and dependency/security risk in code changes. | [.agents/skills/code-review/SKILL.md](.agents/skills/code-review/SKILL.md) |
| debugging-assistant | Diagnose runtime issues, environment drift, and root causes with reproducible steps. | [.agents/skills/debugging-assistant/SKILL.md](.agents/skills/debugging-assistant/SKILL.md) |
| documentation | Produce and refine technical docs and contributor-facing guidance. | [.agents/skills/documentation/SKILL.md](.agents/skills/documentation/SKILL.md) |
| implementation-engineer | Implement minimal, secure, validated code changes across userscript/backend boundaries. | [.agents/skills/implementation-engineer/SKILL.md](.agents/skills/implementation-engineer/SKILL.md) |
| network-resilience | Improve timeout/retry/offline behavior and user feedback for networked flows. | [.agents/skills/network-resilience/SKILL.md](.agents/skills/network-resilience/SKILL.md) |
| performance-optimization | Identify bottlenecks and implement measurable performance improvements. | [.agents/skills/performance-optimization/SKILL.md](.agents/skills/performance-optimization/SKILL.md) |
| qa-testing | Plan and execute coverage-focused testing and regression validation. | [.agents/skills/qa-testing/SKILL.md](.agents/skills/qa-testing/SKILL.md) |
| refactoring-expert | Refactor safely with behavior-preserving, incremental changes. | [.agents/skills/refactoring-expert/SKILL.md](.agents/skills/refactoring-expert/SKILL.md) |
| release-management | Coordinate release readiness, migration safety, deploy gates, and rollback planning. | [.agents/skills/release-management/SKILL.md](.agents/skills/release-management/SKILL.md) |
| requirements-researcher | Clarify scope, constraints, and trade-offs before specification and implementation. | [.agents/skills/requirements-researcher/SKILL.md](.agents/skills/requirements-researcher/SKILL.md) |
| security-risk | Perform threat modeling and security/privacy risk assessment with mitigations. | [.agents/skills/security-risk/SKILL.md](.agents/skills/security-risk/SKILL.md) |
| spec-writer | Write or update actionable implementation plans and specs. | [.agents/skills/spec-writer/SKILL.md](.agents/skills/spec-writer/SKILL.md) |
| userscript-implementation | Implement and harden Tampermonkey behavior with CSP-safe and privacy-safe defaults. | [.agents/skills/userscript-implementation/SKILL.md](.agents/skills/userscript-implementation/SKILL.md) |
| ux-accessibility | Validate and improve keyboard, focus, semantics, and contrast for UI changes. | [.agents/skills/ux-accessibility/SKILL.md](.agents/skills/ux-accessibility/SKILL.md) |

## Phase to Skills Mapping

- Phase 0 -> 1 Safety Gate: `requirements-researcher`, `security-risk`
- Phase 1 Implementation: `implementation-engineer` (primary), `userscript-implementation` (userscript-focused), `debugging-assistant`, `refactoring-expert`, `network-resilience` (situational)
- Phase 2 Code Review Gate: `code-review`, `security-risk`
- Phase 3 Quality Validation: `qa-testing`, `performance-optimization`, `ux-accessibility`
- Phase 4 Security Testing Gate: `security-risk`
- Phase 5 Documentation: `documentation`
- Phase 6 Maintenance and Release Readiness: `release-management` (primary), `code-review` + `security-risk` (supporting), `debugging-assistant` (incident triage, situational)

## Agent Briefs

- `.github/agents/requirements-analyst.agent.md`
- `.github/agents/implementation-engineer.agent.md`
- `.github/agents/security-reviewer.agent.md`
- `.github/agents/code-reviewer.agent.md`
- `.github/agents/quality-validator.agent.md`
- `.github/agents/documentation-writer.agent.md`

Each brief is role-specific and links back to canonical policy docs.

## Local Quality Gates

- Enable hooks once per clone: `git config core.hooksPath .githooks`
- Pre-push verify: `npm run prepush:verify`
- Test anti-pattern checks: `npm run test:anti-patterns`
- CI userscript lint gate: `.github/workflows/userscript-lint.yml`
- CI coverage + anti-pattern gate: `.github/workflows/coverage-report.yml`
- CI workflow docs consistency gate: `.github/workflows/workflow-docs-check.yml`

## Governance

- Policy and gate criteria authority: `docs/workflow/gates.md`
- Handoff contract authority: `docs/workflow/handoff-format.md`
- Workflow orchestration and phase mapping authority: `AGENTS.md`
- Policy edits must update canonical docs first, then references.
- Policy-impacting gate changes require repository maintainer + security-reviewer approval.

## Locked-Decision Change Control

Locked policy decisions may be overridden only when a hard contradiction cannot be resolved through wording alignment alone.

- Required approvers: repository maintainer + security-reviewer
- Required records:
  - `spec/policy-exceptions.md`
  - linked row in `spec/contradiction-matrix.md`
  - rationale update in `AGENTS.md` (or explicit note when not applicable)

## Reference Documents

- `apps/backend/SECURITY.md`
- `TECHNICAL.md`
- `PHASES_4B_5_COMPLETE.md`

**Last Updated:** 2026-03-02
