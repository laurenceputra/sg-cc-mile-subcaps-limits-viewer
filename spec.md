# Sync + Dashboard Cleanup Spec

## Goal

Reduce this repo to the API and code paths required for **userscript card sync + web dashboard**, and remove dormant surface area that is not used by runtime frontend flows.

## Work Size

- Estimated size: **medium-large** (cross-cutting backend + userscript + tests + docs).
- Expected PR strategy: **3-5 focused PRs** instead of one large cut.

## Scope and Defaults

- Default product scope for this cleanup:
  - Keep userscript sync working (`register/login`, `get/put sync data`).
  - Keep userscript parity for UOB + Maybank card sync behavior.
  - Keep dashboard capability (`/login`, `/dashboard`) and session flow (`/auth/refresh`, `/auth/logout`).
- Out of scope for first pass:
  - No schema-drop migration in D1 (do not drop DB tables in first pass).
  - No auth model redesign in first pass.

## Runtime API Usage Inventory (Current)

### Required by userscript sync runtime

- `POST /auth/register`
- `POST /auth/login`
- `GET /sync/data`
- `PUT /sync/data`

### Required by dashboard runtime

- `GET /login`
- `GET /dashboard`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /sync/data`
- `GET /meta/cap-policy`

### Used by userscript, but not core sync

- `GET /meta/cap-policy` (policy fetch with embedded fallback)

### Not used by userscript + dashboard runtime flow

- `GET /shared/mappings/:cardType`
- `POST /shared/mappings/contribute`
- `DELETE /user/data`
- `GET /user/export`
- `PATCH /user/settings`
- `POST /auth/logout-all`
- `POST /auth/device/register`
- `DELETE /auth/device/:deviceId`
- `GET /auth/devices`

### Admin-only paths (not required for userscript/dashboard runtime)

- `POST /admin/auth/login`, `POST /admin/auth/logout`
- `GET /admin/mappings/pending`, `POST /admin/mappings/approve`
- `GET /admin/health/cleanup`

## Target Surface (After Cleanup)

### Keep

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /sync/data`
- `PUT /sync/data`
- `GET /login`
- `GET /dashboard`
- `GET /meta/cap-policy`

### Remove in cleanup phases

- Shared mappings subsystem (routes, wrappers, docs/contracts, tests).
- Device-management endpoints.
- User settings/export/delete endpoints.
- Admin mapping moderation endpoints.
- `logout-all` endpoint.

## Phased Plan

## Phase 1 - Remove dormant client code first (lowest risk)

### File targets

- `apps/userscript/bank-cc-limits-subcap-calculator.user.js`
- `apps/userscript/__tests__/api-client-extra.test.js`
- `apps/userscript/__tests__/sync-manager-flow.test.js`
- `apps/userscript/__tests__/sync-manager-success.test.js`
- Any userscript tests that only cover shared mappings/delete-user wrappers

### Changes

- Remove unused userscript API wrappers and pass-through methods:
  - `getSharedMappings`
  - `contributeMappings`
  - `deleteUserData`
- Remove `SyncManager` logic tied only to dormant mapping-sharing paths.
- Keep sync core paths unchanged.

### Acceptance criteria

- Userscript sync setup/unlock/sync flows behave the same.
- No runtime references to removed wrappers remain.

## Phase 2 - Prune backend endpoints not used by userscript or dashboard

### File targets

- `apps/backend/src/app.js`
- `apps/backend/src/api/shared-mappings.js` (remove)
- `apps/backend/src/api/user.js` (remove or reduce to empty route set)
- `apps/backend/src/api/admin.js` (remove mapping moderation routes)
- `apps/backend/src/api/auth.js` (remove device and logout-all routes)
- `apps/backend/src/storage/db.js` (remove now-dead methods)
- `apps/backend/src/middleware/rate-limit-config.js` / `apps/backend/src/middleware/rate-limiter.js` (remove dead limiter entries)

### Changes

- Unroute and delete dead APIs listed in this spec.
- Remove imports and middleware wiring for removed routes.
- Remove DB methods that become unreachable.

### Acceptance criteria

- Backend still serves userscript sync endpoints and dashboard/session endpoints.
- Removed endpoints are absent from app wiring and tests/docs.
- No unused imports/functions remain for removed subsystems.

## Phase 3 - Align contracts/docs/tests to the reduced surface

### File targets

- `apps/contracts/sync-api.md`
- `apps/contracts/schemas/shared-mapping.schema.json` (remove if subsystem removed)
- `apps/backend/README.md`
- `TECHNICAL.md`
- `README.md`
- Backend worker tests under `apps/backend/src/__tests__/workers/`

### Changes

- Remove or rewrite shared-mappings and user/device/admin endpoint docs.
- Keep contract docs focused on userscript sync + dashboard/session (+ cap policy).
- Delete tests that only validate removed endpoints.
- Keep/expand tests for auth+sync+dashboard session correctness and failure modes.

### Acceptance criteria

- Docs match actual routed API surface.
- Test suite contains no coverage for deleted endpoints.
- Remaining tests validate sync and dashboard session contracts thoroughly.

## Optional Phase 4 - Data model cleanup (dashboard retained)

Do this only after phases 1-3 are stable.

### Candidate reductions

- Remove only schema/table columns that belong exclusively to deleted subsystems.
- Keep dashboard pages and refresh-token session flow intact.
- Add explicit forward migration(s) for any table cleanup.

### Note

This phase changes security/session posture and must pass Backend/Auth/Schema gates in `docs/workflow/gates.md`.

## Verification Plan

Run after each phase:

- `npm run lint:userscript`
- `npm run test:userscript`
- `npm --prefix apps/backend test`
- `npm run test:anti-patterns`
- `npm run docs:check:workflow` (when docs are changed)

For backend route removals:

- Add/keep explicit route-level tests for kept endpoints:
  - register/login success + failure
  - refresh/logout success + auth-failure paths
  - sync get/put success
  - sync version conflict behavior

Manual smoke checks after backend changes:

- `GET /login` page loads and login succeeds.
- Dashboard loads and fetches sync data.
- Dashboard refresh flow renews access token (`/auth/refresh`).
- Dashboard logout clears session (`/auth/logout`) and blocks protected fetch.

## Failure Modes and Rollback

- Risk: accidental removal of still-needed auth/sync path.
  - Mitigation: phase-by-phase deletion and route-level tests before each merge.
- Risk: accidental dashboard/session regression.
  - Mitigation: dashboard route + refresh/logout smoke checks required for backend PRs.
- Risk: docs drift after endpoint removal.
  - Mitigation: docs update is required in same PR as route removal.
- Rollback:
  - Revert the most recent cleanup PR only (small PR strategy).

## Commit Guidance

- Commit 1: userscript dormant wrappers/tests removal.
- Commit 2: backend route and DB-method pruning.
- Commit 3: contracts/docs/test alignment.
- Commit 4 (optional): schema cleanup migration for removed subsystems.

## Completion Checklist

- [ ] Userscript sync flows pass manually and via tests.
- [ ] Dashboard login/dashboard/refresh/logout flows pass manually and via tests.
- [ ] Removed endpoints no longer routed in `apps/backend/src/app.js`.
- [ ] Dead DB methods for removed subsystems are deleted.
- [ ] Contracts and README/TECHNICAL docs match real API surface.
- [ ] Anti-pattern and lint gates pass.
- [ ] No shared-mappings/admin/device/user-management runtime paths remain unless explicitly retained.
