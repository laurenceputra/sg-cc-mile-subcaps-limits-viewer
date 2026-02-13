---
name: userscript-implementation
description: "Implement and harden Tampermonkey userscript features in this repo with CSP-safe UI patterns, GM transport, strict sync privacy, and regression-safe multi-card behavior."
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
  version: 1.0.0
---

# Userscript Implementation

Implement userscript changes with strict focus on runtime compatibility, privacy guarantees, and cross-portal regression safety.

## Use This Skill When
- The task changes `apps/userscript/bank-cc-limits-subcap-calculator.user.js`.
- The task involves Tampermonkey metadata (`@match`, `@grant`, `@connect`).
- The task touches overlay/UI rendering, sync transport, or card extraction rules.
- The task involves CSP/CSRF/network issues on supported bank portals.

## Workflow
1. Confirm card/portal scope and list impacted flows (UOB, Maybank, or both).
2. Identify whether the change touches:
   - metadata permissions (`@connect`, `@match`, `@grant`)
   - UI render path (tabs, styles, modal/overlay behavior)
   - sync payload/model and merge behavior
   - backend compatibility requirements
3. Implement the smallest safe diff with explicit backward compatibility.
4. Run required lint/syntax/test checks.
5. Validate runtime interactions on affected portal pages and document outcomes.

## Implementation Guardrails

### Metadata and Network
- Keep `@connect` least-privilege:
  - Prefer explicit hosts over broad wildcards.
  - Include required preview/runtime hosts only.
- For cross-origin calls from bank pages, prefer `GM_xmlhttpRequest` transport.
- Keep fetch fallback when GM transport is unavailable.
- Preserve auth headers and JSON parsing consistency across transport paths.

### CSP-Safe UI
- Avoid inline style attributes and direct `.style.*` mutations for new UI work on CSP-restricted portals.
- Prefer class-based styles and `GM_addStyle` injection.
- Keep UI behavior parity across supported portals unless explicitly card-specific.
- Verify scroll behavior when changing panel containers (`overflow` is a common regression vector).

### Card-Specific UX
- Card differences must be explicit in `CARD_CONFIGS` (for example: `showManageTab`).
- Do not silently apply one card's UX restriction to all cards.
- Keep shared functions card-aware via explicit parameters, not hidden globals.

### Sync Privacy Model
- Raw transaction rows remain local unless the requirement explicitly changes that policy.
- Sync payload should include only sanctioned fields (for example settings + monthly aggregates).
- Preserve non-active cards when active-card-only sync is required.
- Maintain compatibility with legacy payload shapes during reads.

### Scope Safety
- When moving functions across scopes/modules, audit all referenced symbols.
- Never rely on block-scoped constants from a different closure.
- Treat `no-undef` lint errors as release blockers.

## Required Verification
- `node --check apps/userscript/bank-cc-limits-subcap-calculator.user.js`
- `npm run lint:userscript`
- `npm --prefix apps/backend test` when userscript changes rely on backend auth/csrf/sync behavior

## Required Manual Checks
- Button appears on target page(s).
- Primary click path works (open overlay, switch tabs, close).
- Card-specific tab behavior is correct (for example UOB manage visible, XL hidden).
- Sync setup/login/sync now flow works on affected portal(s).
- Browser console has no new CSP/connect/ReferenceError failures.

## Output Format
- Scope
- Files changed
- Behavioral impact (per card/portal)
- Verification results
- Risks/follow-ups
