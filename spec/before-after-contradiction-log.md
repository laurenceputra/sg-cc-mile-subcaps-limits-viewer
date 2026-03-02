# Before/After Contradiction Log

## Alias Inventory
| alias detected (before) | canonical mapping | disposition |
| --- | --- | --- |
| `Phase 2 (Design Review)` | `Phase 2 Code Review Gate` | resolved in `.github/agents/security-reviewer.agent.md` |
| `Phase 5 (Code Review)` | `Phase 2 Code Review Gate` (security checklist context) | resolved in `.github/agents/security-reviewer.agent.md` |
| `Phase 7 (Penetration Testing)` | `Phase 4 Security Testing Gate` | resolved in `.github/agents/security-reviewer.agent.md` |
| `Decision` (phase gate outcome label) | `Gate Decision` | resolved in `AGENTS.md` and downstream files |
| `Security sign-off (APPROVE / BLOCK)` | `Security Sign-off (APPROVE / REQUEST CHANGES / BLOCK)` | resolved in `AGENTS.md` and `.github/agents/security-reviewer.agent.md` |
| `No network calls beyond the page itself` | local-first default + optional approved encrypted sync/auth | resolved in `.github/agents/implementation-engineer.agent.md` |

## Contradiction Classes

### 1) Phase and gate naming
- before: mixed phase labels (`Design Review`, `Phase 7`) in `.github/agents/security-reviewer.agent.md`
- after: canonical `Phase 0 -> 1 Safety Gate`, `Phase 2 Code Review Gate`, `Phase 4 Security Testing Gate`
- disposition: resolved

### 2) Decision vocabulary and security outcome states
- before: two-state `APPROVE / BLOCK` security output variants
- after: unified `APPROVE / REQUEST CHANGES / BLOCK` with explicit `Gate Decision` and `Security Sign-off`
- disposition: resolved

### 3) Local-first and optional sync messaging
- before: implementation brief prohibited all network calls beyond page scope
- after: local-first default with optional approved encrypted sync/auth and explicit no sensitive remote logging
- disposition: resolved

### 4) Phase 4 security testing execution requirements
- before: `security-risk` skill did not explicitly require OWASP ZAP + manual pen-test gate criteria
- after: mandatory Phase 4 section added with explicit gate criteria
- disposition: resolved

### 5) Anti-pattern ownership and handoff schema
- before: agent briefs lacked deterministic anti-pattern/manual-review and applicability-driven handoff fields
- after: all `.github/agents/*.agent.md` include applicability and mandatory handoff schema behavior
- disposition: resolved

### 6) Backend/auth/schema tightening propagation
- before: tightening gates only centralized in `AGENTS.md`
- after: propagated to implementation/security/release skills and relevant agent briefs
- disposition: resolved

### 7) Discovery sweep out-of-primary files
- before: discovery surfaced product docs and vendored docs with legacy/non-governing phrasing
- after: classified as historical/non-governing in contradiction matrix with rationale; no policy conflict in governing corpus
- disposition: historical/non-governing
