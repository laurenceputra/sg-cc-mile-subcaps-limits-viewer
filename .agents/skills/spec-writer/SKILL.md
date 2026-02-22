---
name: spec-writer
description: "Write or update specification/plan documents (e.g., spec/plan.md) with explicit tasks, file targets, acceptance criteria, verification, and commit steps; use when asked to write/update specs, plans, or requirements."
license: MIT
tags:
  - planning
  - documentation
  - specs
allowed-tools:
  - bash
  - git
  - markdown
metadata:
  author: laurenceputra
  version: 1.3.0
---

# Spec Writer

Write clear, executable specifications/plan documents that other contributors can follow without ambiguity.

## Defaults
- **Target file**: `spec/plan.md` unless the user specifies a different path.
- **Do not default to hidden spec dirs**: Never choose `.spec/plan.md` unless the user explicitly asks for that path.
- **Update behavior**: Overwrite the target file by default. Append only if the user explicitly asks to “add to” or “append to” the existing plan.
- **Template**: If `spec/plan.md` already exists, use its structure as the template and keep section ordering unless the user asks otherwise.
- **Legacy compatibility**: If `spec/plan.md` does not exist but `.spec/plan.md` or `.specifications/plan.md` does, use the legacy file as reference and prefer writing the new output to `spec/plan.md`.
- **Repo scan before writing**: Read project instructions and relevant docs before drafting.

## Pre‑write Checklist
1. Read repository instructions first:
   - `AGENTS.md`
   - `.github/copilot-instructions.md`
2. Read the current plan (if present): `spec/plan.md` (fallbacks: `.spec/plan.md`, `.specifications/plan.md`).
3. Skim the most relevant docs for the request (examples: `README.md`, `docs/*`, `TECHNICAL_DESIGN.md`, `SYNC_ARCHITECTURE.md`).
4. If requirements are missing or ambiguous, ask the user focused questions before writing.

## Writing Rules
- Use precise, testable language.
- Every task must name the exact files to update.
- Include **acceptance criteria** per major task.
- Include a **verification** section (manual checks + commands if applicable).
- Include a **commit step** with a suggested concise message.
- Keep formatting consistent and scannable (headings + lists).
- Avoid implementation details that aren’t required for execution.

## UI/Card Spec Requirements (Mandatory when applicable)
- Include these sections for UI/card-related specs:
  - `Config Delta` (new/changed config keys, defaults, fallback behavior)
  - `Surface Scope` (userscript, dashboard, or both)
  - `Reuse Plan (Per Surface)` (reused helpers/components inside each surface)
  - `Card Parity Matrix` (expected behavior per affected card)
- Acceptance criteria must explicitly call out:
  - cap text format expectations (when applicable)
  - category ordering policy, especially `Others` last when applicable.

## Required Sections (minimum)
- **Goal**
- **Work Size** (`small` | `medium` | `large`) with a brief rationale.
- **Work Items and Exact Changes** (with file targets)
- **Acceptance criteria** (per work item)
- **Verification**
- **Commit**
- **Completion Checklist**

## Update Behavior
- If overwriting: replace the entire file.
- If appending: add a new section clearly labeled with date or change scope.

## Output Expectations
- Keep it concise but complete. Another contributor should be able to execute without asking for clarification.
- Always include a relative size call (`small`, `medium`, or `large`) in the output.
- If any dependency exists (secrets, env vars, tools), explicitly list it.
