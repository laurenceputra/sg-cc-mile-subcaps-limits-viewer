---
name: release-management
description: Release engineer with expertise in software deployment, versioning, schema migration stewardship, and release gating. Use this skill when planning releases, managing versions, coordinating deploys, or validating schema/auth/session changes before shipping.
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
  version: 1.0.0
---

# Release Management

Plan and execute releases with explicit quality gates, migration discipline, and rollback readiness.

## Workflow
1. Define release scope, risk class, and target version.
2. For schema-touching changes, document forward migration steps and compatibility assumptions.
3. Verify environment parity before deploy:
   - required secrets/bindings present
   - config/runtime assumptions match target environment
4. Run pre-release gates:
   - tests
   - deployment smoke checks on preview URL
   - critical auth/session/data paths
5. Prepare release notes, rollback plan, and operator checklist.
6. Monitor post-release signals and capture follow-up fixes.

## Required Gates for Backend/Auth/Schema Releases
- Schema compatibility gate passed (including migration path).
- Preview smoke gate passed for login/session/data flows.
- Environment parity gate passed.
- Rollback plan documented and executable.

## Output Format
- Release scope and version
- Migration checklist (if applicable)
- Gate results (test + preview smoke + env parity)
- Rollback plan
- Release notes and follow-ups

## References
- [Release guide and templates](references/release-guide.md)
