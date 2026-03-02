# Handoff Format (Canonical)

All workflow agents and skills should use this handoff contract unless a role-specific output requires additional fields.

## Required Fields

- Summary of findings
- Assumptions and unknowns
- Deliverables (code, docs, reports, or artifacts)
- Risks and recommended mitigations
- Security sign-off (`N/A` unless the role owns a security gate)
- Anti-pattern checks run (`npm run test:anti-patterns`) and result summary, or `N/A` with reason
- Manual-only anti-pattern review summary, or `N/A` with reason
- Scope-move audit (functions moved across scopes/modules), or `N/A`
- External-symbol audit (non-local symbols referenced by moved/rewired paths), or `N/A`
- Interaction proof for changed UI paths (minimum: entry action + one primary click path), or `N/A`

## Gate Roles

- Security gate owner (`security-reviewer` / `security-risk`) must provide:
  - Gate Decision: `APPROVE`, `REQUEST CHANGES`, or `BLOCK`
  - Security Sign-off: `APPROVE`, `REQUEST CHANGES`, or `BLOCK`

## Verification Reporting Rules

- List exact command(s) run.
- Provide a one-line outcome per command.
- If a check is skipped, include explicit reason.
