---
name: userscript-implementation
description: Implement and harden Tampermonkey userscript features with CSP-safe UI patterns and strict sync privacy defaults.
license: MIT
tags:
  - implementation
  - userscript
  - tampermonkey
  - csp
  - sync
allowed-tools:
  - bash
  - git
  - markdown
metadata:
  author: laurenceputra
  version: 1.1.0
---

# Userscript Implementation

Use this skill for userscript-specific behavior, metadata, DOM extraction, and portal compatibility.

## Scope
- Validate Tampermonkey metadata changes (`@match`, `@grant`, `@connect`).
- Keep UI rendering CSP-safe and portal-compatible.
- Preserve sync privacy model and multi-card behavior.

## Role-Specific Guardrails
- Keep `@connect` least-privilege.
- Prefer class-based styling and `GM_addStyle` for new UI.
- For selector fallback arrays, continue evaluation until semantic card validation passes.
- In observer + timeout flows, clear pending timers on early resolve.

## Output
- Behavioral impact by portal/card
- Verification and manual-check outcomes
- Risks and compatibility notes

## Canonical References
- Workflow gates: `docs/workflow/gates.md`
- Handoff contract: `docs/workflow/handoff-format.md`
