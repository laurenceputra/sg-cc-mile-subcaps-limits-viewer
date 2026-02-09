# Goal

Decouple `apps/backend` and `apps/userscripts/uob-lady-solitaire` so each app is self-contained under `apps/`, with no runtime or build dependency on `packages/*` workspace libraries.

Success criteria:
- No `@bank-cc/shared`, `@bank-cc/crypto`, or `@bank-cc/sync-client` dependency remains in app codepaths.
- Root workspace no longer requires `packages/*`.
- Backend and userscript can be built/tested independently from `apps/` directories.

# Constraints

- Preserve current behavior (sync auth, encrypted payload handling, shared mappings normalization, UI validation behavior).
- Keep security posture unchanged (no plaintext sync payloads, no new sensitive logging).
- Avoid introducing a new “shared runtime package” replacement.

# Work Items and Exact Changes

## 1) Define explicit cross-app boundary (contract-only, no shared runtime code)

Files:
- `apps/contracts/sync-api.md` (new)
- `apps/contracts/schemas/sync-payload.schema.json` (new)
- `apps/contracts/schemas/shared-mapping.schema.json` (new)

Changes:
- Create a small contract folder in `apps/` that documents backend API request/response structures and validation invariants.
- Treat these files as documentation + schema references only (no importable JS module shared by both apps).
- Document normalization/validation rules currently relied upon by both apps (merchant normalization, card type constraints, payload shape).

## 2) Backend: replace shared package usage with local module(s)

Files:
- `apps/backend/src/api/shared-mappings.js`
- `apps/backend/src/lib/merchant-normalization.js` (new)
- `apps/backend/package.json`

Changes:
- Move merchant normalization logic used by `/shared/mappings/*` routes into a backend-local module in `apps/backend/src/lib/`.
- Update `shared-mappings.js` imports to use backend-local code.
- Remove `@bank-cc/shared` from backend dependencies.

## 3) Userscript: inline sync-client/crypto/shared helpers into app-local modules

Files:
- `apps/userscripts/uob-lady-solitaire/src/sync-manager.js`
- `apps/userscripts/uob-lady-solitaire/src/sync-ui.js`
- `apps/userscripts/uob-lady-solitaire/src/sync/` (new folder, app-local modules)
- `apps/userscripts/uob-lady-solitaire/package.json`

Changes:
- Copy/adapt required code from `packages/sync-client`, `packages/crypto`, and `packages/shared` into app-local userscript modules under `src/sync/` (for example: `api-client.js`, `crypto-manager.js`, `sync-engine.js`, `storage-adapter.js`, `utils.js`, `validation.js`).
- Update `sync-manager.js` and `sync-ui.js` imports to local relative paths only.
- Keep functional behavior equivalent (URL validation, device ID generation, payload validation, crypto conversions).
- Remove `@bank-cc/sync-client`, `@bank-cc/shared`, and `@bank-cc/crypto` from userscript dependencies.

## 4) Workspace/package cleanup to remove shared package coupling

Files:
- `package.json`
- `package-lock.json`
- `packages/` (remove directory after migration)

Changes:
- Remove `packages/*` from root `workspaces`.
- Regenerate lockfile after dependency cleanup.
- Delete `packages/` directory once app-local replacements are in place.

## 5) Documentation updates to reflect simplified architecture

Files:
- `README.md`
- `TECHNICAL.md`
- `apps/backend/README.md`
- `apps/userscripts/uob-lady-solitaire/README.md`

Changes:
- Remove or rewrite references that describe `packages/*` as shared runtime dependencies.
- Document new architecture: backend and userscript are independent apps that integrate only over HTTP contract.
- Add note that contracts live under `apps/contracts/`.

# Acceptance criteria

## Work Item 1
- `apps/contracts/` exists with API and schema docs that cover sync payload and shared mappings formats used today.
- Contracts are human-readable and versioned in git.

## Work Item 2
- Backend has zero imports from `@bank-cc/shared`.
- Backend route behavior for shared mappings remains unchanged in tests/manual checks.
- `apps/backend/package.json` has no `@bank-cc/*` dependency entries.

## Work Item 3
- Userscript has zero imports from `@bank-cc/shared`, `@bank-cc/crypto`, and `@bank-cc/sync-client`.
- Userscript builds successfully and sync features still initialize and run.
- `apps/userscripts/uob-lady-solitaire/package.json` has no `@bank-cc/*` dependency entries.

## Work Item 4
- Root workspace lists only app workspaces under `apps/`.
- `packages/` is removed from active repo codepath.
- Fresh install completes without unresolved workspace dependencies.

## Work Item 5
- Top-level and app READMEs no longer mention shared runtime packages.
- Docs clearly describe contract-only coupling between backend and userscript.

# Verification

Manual/code checks:
- Confirm no app import/dependency references remain:
  - `find apps -type f \( -name '*.js' -o -name '*.json' -o -name '*.md' \) | xargs grep -n '@bank-cc/'`
- Confirm workspace cleanup:
  - `cat package.json`
- Confirm userscript build:
  - `npm run build --workspace apps/userscripts/uob-lady-solitaire`
- Confirm backend tests:
  - `npm run test --workspace apps/backend`
- Confirm clean install after lock refresh:
  - `npm install`

Behavior checks:
- In userscript UI, Sync setup still validates server URL and can perform login/register flow.
- Backend `/shared/mappings/:cardType` and `/shared/mappings/contribute` still accept/reject inputs the same as before.

# Commit

Suggested commit sequence:
1. `refactor(backend): localize shared mapping normalization`
2. `refactor(userscript): inline sync and shared helpers into app-local modules`
3. `chore(monorepo): remove packages workspace and legacy shared packages`
4. `docs: update architecture to app-only with contract boundary`

If squashing into one commit:
- `refactor: decouple backend and userscript from shared workspace packages`

# Completion Checklist

- [ ] Contracts added under `apps/contracts/` and reviewed for parity with current API.
- [ ] Backend migrated off `@bank-cc/shared`.
- [ ] Userscript migrated off `@bank-cc/shared`, `@bank-cc/crypto`, `@bank-cc/sync-client`.
- [ ] Root workspace and lockfile updated; `packages/` removed.
- [ ] Docs updated to reflect app-only architecture.
- [ ] Build/tests pass for both apps.
