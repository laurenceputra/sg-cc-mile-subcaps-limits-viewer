---
name: release-management
description: Release engineer with expertise in software deployment, versioning, schema migration stewardship, and release gating.
license: MIT
tags:
  - release
  - versioning
  - deployment
allowed-tools:
  - bash
  - git
  - markdown
metadata:
  author: laurenceputra
  version: 1.1.0
---

# Release Management

Use this skill for release planning, deploy readiness, and rollback safety.

## Scope
- Define release scope and risk class.
- Verify migration/deploy prerequisites and runtime parity.
- Plan rollback and post-release observation signals.

## Role-Specific Guardrails
- Treat unexplained auth/session/data-path 5xx spikes as blockers.
- Require explicit operator checklist for high-risk releases.

## Output
- Release checklist
- Gate outcomes
- Rollback and monitoring plan

## Canonical References
- Workflow gates: `docs/workflow/gates.md`
- Handoff contract: `docs/workflow/handoff-format.md`
