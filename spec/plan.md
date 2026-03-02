# Agent and Skill Workflow Cleanup Plan

## Goal
Reduce workflow bloat without weakening security controls by separating canonical policy from role-specific guidance, removing duplicated rules across agent and skill docs, and keeping a fast path for common work.

## Work Size
`medium` - This is a documentation refactor across workflow, agent briefs, and 14 skill files, plus one lightweight consistency check script.

## Dependencies
- `node`/`npm` available locally (for doc consistency check script and npm script wiring).
- Repository write access for `AGENTS.md`, `.github/agents/*`, and `.agents/skills/*`.
- No secrets or environment variables required.

## Open Decisions Resolved (Recommended Defaults)
- **Success metric:**
  - Reduce `AGENTS.md` from 384 lines to <= 240 lines.
  - Keep full mandatory gate definitions in one canonical file only (`docs/workflow/gates.md`).
  - Reduce repeated mandatory gate blocks in agent/skill docs to references/links only.
- **Source-of-truth precedence:**
  - Policy and gate criteria: `docs/workflow/gates.md` (authoritative).
  - Handoff contract: `docs/workflow/handoff-format.md` (authoritative).
  - Workflow orchestration and phase mapping: `AGENTS.md` (authoritative).
- **Skill classification criteria:**
  - `core`: directly mapped to a mandatory workflow phase or gate decision path.
  - `situational`: only invoked when the task scope explicitly includes that concern.
- **Workflow-doc validator fail conditions:**
  - Fail when a skill listed in `AGENTS.md` has no matching `.agents/skills/<skill>/SKILL.md`.
  - Fail when a skill directory exists but is not represented in `AGENTS.md` skills index.
  - Fail when mandatory gate headings are fully redefined outside `docs/workflow/gates.md` (links allowed).
  - Fail when referenced agent/skill files in workflow docs do not exist.
- **Migration strategy for moved sections/anchors:**
  - Add "moved to" pointers in `AGENTS.md` for relocated policy sections.
  - Update links in `README.md`, `.github/copilot-instructions.md`, `.github/agents/*`, and `.agents/skills/*` in the same change set.
  - Run a repository-wide link check via `docs:check:workflow` before merge.
- **Execution order (required):**
  1. Add canonical docs (`docs/workflow/gates.md`, `docs/workflow/handoff-format.md`).
  2. Update `AGENTS.md` to reference canonical docs.
  3. Trim agent briefs and skill docs to delta-only guidance.
  4. Add workflow validator script + npm script + CI workflow.
  5. Refresh `README.md` and `.github/copilot-instructions.md` links.
- **Governance:**
  - Workflow policy edits must update canonical docs first, then references.
  - Approval required: repository maintainer + security-reviewer for policy-impacting gate changes.
- **Spec tracking decision:**
  - Track `spec/plan.md` in git by updating `.gitignore` with an explicit unignore rule for this file.

## Work Items and Exact Changes

### 0) Make the plan file trackable in git
- Update `.gitignore` to keep `spec/` generally ignored but unignore `spec/plan.md`.

### 1) Create a single canonical policy surface
- Update `AGENTS.md` to keep only:
  - workflow phases and gate ownership,
  - skill index and phase mapping,
  - links to canonical gate/handoff docs.
- Add `docs/workflow/gates.md` with all mandatory gates consolidated in one place:
  - UI/Card change design gates,
  - backend/auth/schema tightening gates,
  - verification default,
  - test anti-pattern gate,
  - security gate criteria.
- Add `docs/workflow/handoff-format.md` with one authoritative handoff template.
- Update `.github/copilot-instructions.md` to reference the new canonical docs.

### 2) Trim agent briefs to role-specific guidance only
- Update these files to keep role mission, when to invoke, role-specific deliverables, and links to canonical policy docs (remove duplicated mandatory gate blocks):
  - `.github/agents/requirements-analyst.agent.md`
  - `.github/agents/implementation-engineer.agent.md`
  - `.github/agents/security-reviewer.agent.md`
  - `.github/agents/code-reviewer.agent.md`
  - `.github/agents/quality-validator.agent.md`
  - `.github/agents/documentation-writer.agent.md`

### 3) Normalize skills into "delta-only" guidance
- Add `.agents/skills/README.md` as the skill catalog with:
  - core vs situational classification,
  - "use when" triggers,
  - links to canonical policy docs.
- Update each skill file so shared policy text is replaced by references to `docs/workflow/gates.md`; keep only unique guardrails and workflow steps:
  - `.agents/skills/code-review/SKILL.md`
  - `.agents/skills/debugging-assistant/SKILL.md`
  - `.agents/skills/documentation/SKILL.md`
  - `.agents/skills/implementation-engineer/SKILL.md`
  - `.agents/skills/network-resilience/SKILL.md`
  - `.agents/skills/performance-optimization/SKILL.md`
  - `.agents/skills/qa-testing/SKILL.md`
  - `.agents/skills/refactoring-expert/SKILL.md`
  - `.agents/skills/release-management/SKILL.md`
  - `.agents/skills/requirements-researcher/SKILL.md`
  - `.agents/skills/security-risk/SKILL.md`
  - `.agents/skills/spec-writer/SKILL.md`
  - `.agents/skills/userscript-implementation/SKILL.md`
  - `.agents/skills/ux-accessibility/SKILL.md`

### 4) Add a lightweight consistency gate for workflow docs
- Add `scripts/validate-workflow-docs.mjs` to check:
  - every skill listed in `AGENTS.md` exists in `.agents/skills/` and vice versa,
  - mandatory gate names appear only in canonical policy docs (or as links),
  - referenced agent files and skill files exist.
- Update `package.json` with `docs:check:workflow` script.
- Add `.github/workflows/workflow-docs-check.yml` to run `npm run docs:check:workflow` on pull requests that touch workflow docs.

### 5) Refresh top-level discoverability
- Update `README.md` documentation section to include links to:
  - `docs/workflow/gates.md`
  - `docs/workflow/handoff-format.md`
  - `.agents/skills/README.md`

## Acceptance criteria

### Work Item 0
- `spec/plan.md` is visible in `git status` and can be committed.
- Ignore behavior remains unchanged for other files under `spec/` unless explicitly unignored.

### Work Item 1
- `AGENTS.md` no longer repeats full gate definitions already present in `docs/workflow/gates.md`.
- All mandatory gate definitions are present in `docs/workflow/gates.md`.
- `AGENTS.md` links to canonical gate and handoff docs.

### Work Item 2
- Each `.github/agents/*.agent.md` file contains role-specific guidance only (no full duplicated gate blocks).
- Each agent file includes explicit links to canonical gate/handoff docs.

### Work Item 3
- `.agents/skills/README.md` exists and classifies each skill as core or situational.
- All 14 skill files remain present and valid Markdown.
- Skill files keep unique instructions and replace shared policy duplication with canonical references.

### Work Item 4
- `npm run docs:check:workflow` exits 0 on a clean repo state.
- CI workflow runs the same check for relevant file changes.
- Validator fails on intentional mismatch/duplication test cases and passes after fixes.

### Work Item 5
- `README.md` points contributors to the new canonical workflow docs and skill catalog.

## Verification

### Manual checks
- Confirm there is one authoritative source for mandatory gates (`docs/workflow/gates.md`).
- Confirm each agent and skill doc still has clear role-specific instructions.
- Confirm no dead links across `AGENTS.md`, `README.md`, `.github/copilot-instructions.md`, and skill/agent docs.

### Commands
- `git check-ignore -v spec/plan.md`
- `npm run docs:check:workflow`
- `git diff --name-only`

## Commit
- Suggested commit message: `simplify agent workflow and dedupe skill policy docs`
- Commit step:
  - `git add .gitignore AGENTS.md README.md .github/copilot-instructions.md .github/agents .agents/skills docs/workflow scripts/validate-workflow-docs.mjs package.json .github/workflows/workflow-docs-check.yml spec/plan.md`
  - `git commit -m "simplify agent workflow and dedupe skill policy docs"`

## Completion Checklist
- [ ] `.gitignore` updated so `spec/plan.md` is trackable.
- [ ] Canonical gate and handoff docs added under `docs/workflow/`.
- [ ] `AGENTS.md` reduced to orchestration + references.
- [ ] Agent briefs trimmed to role-specific guidance.
- [ ] Skill docs converted to delta-only guidance with catalog added.
- [ ] Workflow docs validation script and CI check added.
- [ ] README and copilot instructions updated to new doc layout.
- [ ] Verification commands executed and passing.
