---
name: spec-writer
description: Write or update specification/plan documents with explicit tasks, file targets, acceptance criteria, and verification.
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
  version: 1.4.0
---

# Spec Writer

Use this skill for executable plans that another contributor can implement without ambiguity.

## Scope
- Default target is `spec/plan.md` unless user specifies otherwise.
- Include exact file targets, acceptance criteria, verification commands, and commit guidance.
- Keep scope explicit and testable.

## Role-Specific Guardrails
- Ask focused questions only when missing decisions block implementation.
- Preserve existing plan structure unless the user asks for a reformat.

## Output
- Goal and work size
- Work items with file targets
- Acceptance criteria and verification
- Completion checklist

## Canonical References
- Workflow gates: `docs/workflow/gates.md`
- Handoff contract: `docs/workflow/handoff-format.md`
