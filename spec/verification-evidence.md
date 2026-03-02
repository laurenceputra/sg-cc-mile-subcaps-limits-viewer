# Verification Evidence

## Baseline Capture
- command: `git diff --name-only HEAD > spec/preexisting-diff.txt`
- output: no stderr/stdout; file created successfully before content edits.
- result: pass

## Tooling Fallback Record
- `rg` unavailable (`/usr/bin/bash: line 1: rg: command not found`), substituted with `grep -R -n --include="*.md"`.
- `python`/`python3` unavailable, substituted with `node -e` equivalents for matrix/scope integrity checks.

## Repo-Wide Discovery Sweep
- command: `grep -R -n --include="*.md" -E "Phase [0-9]|Phase 0 -> 1|Safety Gate|Code Review Gate|Security Testing Gate" .`
- output excerpt: canonical gate terms found in `AGENTS.md` and `.github/agents/security-reviewer.agent.md`; legacy `Phase 5` references only in non-governing `apps/backend/TESTING_CHECKLIST.md` and vendored `node_modules/@bank-cc/backend/TESTING_CHECKLIST.md`.
- result: pass (governing corpus aligned; discovery outliers classified)

- command: `grep -R -n --include="*.md" -E "APPROVE / REQUEST CHANGES / BLOCK|APPROVE / BLOCK|REQUEST CHANGES|Decision:" .`
- output excerpt: tri-state decision vocabulary present in `AGENTS.md`, `.github/agents/security-reviewer.agent.md`, `.agents/skills/security-risk/SKILL.md`, and QA references.
- result: pass

- command: `grep -R -n --include="*.md" -E "No network calls beyond the page itself|local-first|optional sync|encrypted sync|no remote logging" .`
- output excerpt: local-first and optional encrypted sync language present in governing docs; encrypted-sync strings in product/vendored docs captured as discovery-only.
- result: pass

## Targeted Consistency Checks
- command: `grep -n -E "Phase 2 \(Design Review\)|Phase 5 \(Code Review\)|Phase 7 \(Penetration Testing\)" AGENTS.md .github/agents/security-reviewer.agent.md || true`
- output: no matches
- result: pass

- command: `grep -n -E "Phase 0 -> 1 Safety Gate|Phase 2 Code Review Gate|Phase 4 Security Testing Gate" AGENTS.md .github/agents/security-reviewer.agent.md`
- output excerpt: matches in `AGENTS.md` and `.github/agents/security-reviewer.agent.md`
- result: pass

- command: `grep -n -E "APPROVE / REQUEST CHANGES / BLOCK|APPROVE\) / \(BLOCK|APPROVE / BLOCK" AGENTS.md .github/agents/security-reviewer.agent.md .agents/skills/security-risk/SKILL.md`
- output excerpt: tri-state labels only; no remaining `APPROVE / BLOCK` outcomes
- result: pass

- command: `grep -n -E "Config-First Gate|Per-Surface Reuse Gate|Card Parity" AGENTS.md .github/copilot-instructions.md .github/agents/implementation-engineer.agent.md`
- output excerpt: gate names present in `AGENTS.md` and `.github/agents/implementation-engineer.agent.md`
- result: pass

- command: `grep -n -E "test:anti-patterns|Manual-Only|manual-only|coverage-only assertions|permissive default mocks" AGENTS.md .github/agents/code-reviewer.agent.md .github/agents/quality-validator.agent.md .agents/skills/code-review/SKILL.md .agents/skills/qa-testing/SKILL.md`
- output excerpt: automated and manual anti-pattern expectations present across owners
- result: pass

- command: `grep -n -E "run the most relevant verification commands by default|Do not ask permission to run tests|Always include the exact command\(s\)" AGENTS.md .github/agents .agents/skills`
- output excerpt: verification-default language present across AGENTS and relevant skills/agent briefs
- result: pass

- command: `grep -n -E "No network calls beyond the page itself|local-first|optional sync|encrypted sync|no remote logging" AGENTS.md .github/copilot-instructions.md .github/agents/implementation-engineer.agent.md .github/agents/security-reviewer.agent.md`
- output excerpt: local-first and optional encrypted sync/auth language present; no legacy prohibition string remaining
- result: pass

- command: `grep -R -n -E "Schema Compatibility Gate|Preview Smoke Gate|Environment Parity Gate|Failure-Mode Requirement|Post-Deploy Observation Gate" AGENTS.md .github/agents .agents/skills/release-management/SKILL.md .agents/skills/security-risk/SKILL.md .agents/skills/implementation-engineer/SKILL.md`
- output excerpt: all required tightening gates present in listed agent and skill docs
- result: pass

- command: `grep -R -n -E "coverage|target|threshold|APPROVE|REQUEST CHANGES|BLOCK|Decision" .agents/skills/qa-testing/SKILL.md .agents/skills/qa-testing/references`
- output excerpt: canonical thresholds retained in QA skill and reference explicitly delegates policy authority to skill
- result: pass

## Scope and Artifact Integrity Checks
- command: `test -f spec/preexisting-diff.txt`
- output: `ok: preexisting-diff`
- result: pass

- command: `node -e "...allowed-path regex scope guardrail..."`
- output: (empty)
- result: pass

- command: `test -f spec/contradiction-matrix.md`, `test -f spec/discovery-matches.md`, `test -f spec/before-after-contradiction-log.md`, `test -f spec/readthrough-attestation.md`, `test -f spec/verification-evidence.md`, `test -f spec/touched-files.md`, `test -f spec/residual-risk-register.md`, `test -f spec/policy-exceptions.md`, `test -f spec/final-signoff.md`
- output: all `ok`
- result: pass

- command: `grep -n "| file |...|"` checks for matrix/discovery/touched/readthrough headers and required fields in residual/policy/signoff artifacts
- output excerpt: required headers and required-field strings found
- result: pass

- command: `node -e "...matrix covers primary sweep corpus..."`
- output: (empty)
- result: pass

- command: `node -e "...discovery files all appear in matrix..."`
- output: (empty)
- result: pass

- command: `node -e "...diff delta files all listed in touched-files..."`
- output: (empty)
- result: pass

- command: `node -e "...every touched file has readthrough attestation..."`
- output: (empty)
- result: pass

## Additional Notes
- `npm run test:anti-patterns` not executed because no test files were added/edited in this remediation scope.
- All verification commands executed without requesting user permission, consistent with verification-default policy.

## Command Log

To be populated with executed verification commands, output excerpts, and result summary.
