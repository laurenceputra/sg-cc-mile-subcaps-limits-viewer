# Wildcard Escaping for Merchant Names Spec

## Goal

Ensure transaction merchant names containing `*` are treated as literal characters and do not get matched by wildcard patterns unless explicitly escaped, while keeping existing wildcard rules working for merchant names that do not contain `*`.

## Scope From Current-State Review

- Merchant categorization uses `cardSettings.merchantMap` (pattern -> category).
- `resolveCategory` checks exact match, case-insensitive exact match for non-wildcard keys, then wildcard matching for patterns with `*`.
- `matchesWildcard` converts `*` to `.*` and matches case-insensitively; wildcard patterns are inferred solely by `pattern.includes('*')`.
- The UI includes "Add Wildcard Pattern" and lists existing wildcard patterns by `pattern.includes('*')`.

## Assumptions

- Userscript edits must be applied to both `bank-cc-limits-subcap-calculator.user.js` and `apps/userscripts/uob-lady-solitaire/dist/bank-cc-limits-subcap-calculator.user.js` because source tooling is not present.
- No backend or sync contract changes are required; settings remain local-first and payload shape stays the same.
- Existing wildcard patterns should continue to match merchant names that do not contain literal `*` characters.

## Non-Goals

- No changes to transaction parsing, subcap calculations, or category lists.
- No new backend or sync features.
- No new UI sections beyond wildcard help text and listing behavior.

## Work Items and Exact Changes

### 1. Escape-aware wildcard detection and matching

Files to update:

- `bank-cc-limits-subcap-calculator.user.js`
- `apps/userscripts/uob-lady-solitaire/dist/bank-cc-limits-subcap-calculator.user.js`

Exact changes:

- Add helpers:
  - `hasUnescapedWildcard(pattern)` -> returns true only when `pattern` contains `*` not preceded by `\`.
  - `buildWildcardRegex(pattern)` -> converts pattern into an anchored regex where:
    - unescaped `*` becomes `[^*]*` (wildcard does not match literal `*`)
    - escaped `\*` becomes a literal `*`
    - all other regex metacharacters are escaped
- Update `matchesWildcard` to use `hasUnescapedWildcard` + `buildWildcardRegex`, and return false when no unescaped wildcard exists.
- Update `resolveCategory` loops to use `hasUnescapedWildcard(pattern)` instead of `pattern.includes('*')`.

Acceptance criteria:

- Wildcard patterns no longer match merchant names containing literal `*` unless the pattern explicitly includes `\*`.
- Exact match behavior (case-sensitive first, then case-insensitive for non-wildcard keys) remains unchanged.
- Patterns without unescaped `*` are not evaluated as wildcard rules.

### 2. Wildcard UI copy + listing consistency

Files to update:

- same userscript files as above

Exact changes:

- Update wildcard help text to explain:
  - `*` matches any characters except literal `*`
  - use `\*` to match a literal asterisk
  - example: `KrisPay\*Paradise*`
- When listing "Existing Wildcard Patterns", filter using `hasUnescapedWildcard(pattern)` so literal `*` entries are not misclassified.

Acceptance criteria:

- UI help text reflects the new semantics.
- Patterns containing only escaped `*` do not appear in the wildcard list.

### 3. Documentation update

Files to update:

- `TECHNICAL.md`

Exact changes:

- Update the "Pattern syntax" section to document:
  - wildcard behavior excludes literal `*`
  - `\*` escapes a literal asterisk
  - at least one example for merchants containing `*`

Acceptance criteria:

- TECHNICAL.md accurately reflects the new wildcard semantics and includes an escaped example.

## Security & Privacy Review (Phase 0)

- Risks: miscategorization due to new semantics; regex handling bugs; confusion when syncing legacy patterns.
- Mitigations: keep exact-match priority; use anchored regex with `[^*]*`; update UI help text and documentation.
- Residual risk: legacy wildcard rules may stop matching merchants with `*` until users add exact rules or escaped patterns.

## Verification

Manual checks on the UOB PIB transaction page:

1. Create wildcard pattern `KrisPay*` and verify it does **not** match `KrisPay*Paradise C Singapore SG`.
2. Add exact mapping for `KrisPay*Paradise C Singapore SG`; confirm it categorizes correctly.
3. Add wildcard pattern `KrisPay\*Paradise*` and confirm it matches the same merchant.
4. Confirm existing wildcard patterns still match merchants without `*`.
5. Confirm "Existing Wildcard Patterns" only lists patterns with unescaped `*`.

## Commit

Suggested branch: `spec/escape-asterisk-wildcard`

Suggested commit message:

`spec(userscript): define literal-asterisk wildcard handling`

## Completion Checklist

- [ ] Wildcard matching uses escape-aware parsing (`*` does not match literal `*`).
- [ ] Wildcard UI help text and listing updated.
- [ ] TECHNICAL.md updated with escaped examples.
- [ ] Manual verification steps executed.
