# Execution Plan

This file is the canonical per-task execution plan for non-trivial work in this repository. Create or refresh it before implementation so another contributor can execute the task without rediscovering scope, assumptions, verification, or handoff requirements.

## Current Task

- Task ID: `task-groomer`
- Title: `Task Groomer`
- Work size: small documentation/process change
- Goal: turn the ambiguous "Task Groomer" request into an executable documentation task that clarifies how contributors should groom non-trivial work before implementation.

## Assumptions

- "Task Groomer" refers to documentation and contributor workflow clarity, not userscript or backend runtime behavior.
- The smallest useful implementation is to add this tracked execution-plan artifact and reference it from the main workflow docs.
- Because this task only changes documentation, `npm run docs:check:workflow` is the relevant verification gate; broader userscript/backend suites are unnecessary unless code or tests change.
- Work must happen on a dedicated feature branch created from `main`, not on `main` directly.

## Out of Scope

- Changes to userscript runtime logic, backend behavior, contracts, or storage flows
- New workflow automation beyond the existing workflow-doc validation
- Security-policy rewrites, test changes, or release-process changes outside task-definition clarity

## File Targets

| Path | Planned change |
| --- | --- |
| `spec/plan.md` | Define the canonical per-task execution-plan format and capture the current task in that format. |
| `AGENTS.md` | Point contributors to `spec/plan.md` as the per-task execution-plan document to create or refresh before non-trivial implementation. |
| `README.md` | Add a contributor-facing reference so the plan artifact is discoverable outside the agent workflow docs. |

## Ordered Implementation Steps

1. Review `AGENTS.md`, `docs/workflow/gates.md`, `docs/workflow/handoff-format.md`, and `.agents/skills/spec-writer/SKILL.md` to confirm the required task-definition ingredients.
2. Create or refresh `spec/plan.md` with explicit goal, assumptions, out-of-scope boundaries, file targets, implementation steps, acceptance criteria, verification, PR workflow, and handoff expectations.
3. Update `AGENTS.md` so contributors know `spec/plan.md` is the canonical per-task execution-plan document for non-trivial work.
4. Update `README.md` near the workflow/security references so contributors can find `spec/plan.md` without reading agent-only docs first.
5. Run `npm run docs:check:workflow` and treat failures as blockers.
6. Commit with a concise conventional-commit header plus the required Nightshift trailers, push the feature branch, open a PR that summarizes the new task-grooming flow, and return the original checkout to `main`.

## Acceptance Criteria

- `spec/plan.md` exists and can be reused as the canonical per-task execution-plan document for future non-trivial tasks.
- The current `task-groomer` work is captured in this file with explicit assumptions, scope boundaries, file targets, ordered steps, acceptance criteria, verification, and PR workflow.
- `AGENTS.md` tells contributors to create or refresh `spec/plan.md` before non-trivial implementation.
- `README.md` links contributors to `spec/plan.md` from the workflow/security documentation area.
- `npm run docs:check:workflow` passes after the documentation updates.

## Verification

- Run `npm run docs:check:workflow`.
- Skip broader userscript/backend test suites because this task is documentation-only and does not modify runtime or test files.

## PR Workflow

1. Start from `main` and create a dedicated feature branch, for example `chore/task-groomer`.
2. Keep the diff limited to the documentation files listed above.
3. Use a conventional commit header, for example `docs(workflow): add task grooming plan`.
4. Include these commit trailers:

   ```text
   Nightshift-Task: task-groomer
   Nightshift-Ref: https://github.com/marcus/nightshift
   ```

5. Open a PR that explains the new task-grooming flow, why `spec/plan.md` is now canonical for non-trivial tasks, and the verification result.
6. After the PR is submitted, switch the original local checkout back to `main`.

## Handoff Expectations

When handing this task off in a PR or workflow response, include the canonical fields from `docs/workflow/handoff-format.md`:

- Summary of findings
- Assumptions and unknowns
- Deliverables
- Risks and recommended mitigations
- Security sign-off: `N/A` for this docs-only task
- Anti-pattern checks run: `N/A` with reason (no test files changed)
- Manual-only anti-pattern review: `N/A` with reason (no test files changed)
- Scope-move audit: `N/A`
- External-symbol audit: `N/A`
- Interaction proof: `N/A` (no UI path changed)
