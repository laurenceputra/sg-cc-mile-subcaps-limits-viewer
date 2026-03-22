# Sync API Contract

This directory documents the verified HTTP contract between:
- `apps/userscript/bank-cc-limits-subcap-calculator.user.js`
- `apps/backend`

Coupling is contract-only (HTTP + JSON schema). There is no shared runtime package.

## Endpoint-wide rules

- Protected endpoints require `Authorization: Bearer <jwt>`.
- State-changing requests must send JSON with `Content-Type: application/json`.
- Userscript requests without an `Origin` header must send `X-CC-Userscript: tampermonkey-v1`.
- Refresh tokens are stored in the `ccSubcapRefreshToken` cookie scoped to `/auth`.

## Endpoints

### `POST /auth/register`
Request body:
- `email` (string)
- `passwordHash` (string)
- `tier` (optional: `free` or `paid`)

Success response body (`200`):
- `token` (string JWT)
- `userId` (number)
- `tier` (`free` or `paid`)

Behavior notes:
- Does **not** set the refresh token cookie.

Failure modes:
- `400` invalid input or duplicate registration
- `500` registration failure

### `POST /auth/login`
Request body:
- `email` (string)
- `passwordHash` (string)

Success response body (`200`):
- `token` (string JWT)
- `userId` (number)
- `tier` (`free` or `paid`)

Behavior notes:
- Sets a refresh token cookie named `ccSubcapRefreshToken`.
- Cookie attributes: `HttpOnly`, `SameSite=Strict`, `Path=/auth`, `Max-Age=2592000`, and `Secure` in production.

Failure modes:
- `400` invalid input
- `401` invalid credentials
- `500` authentication failure

### `POST /auth/refresh`
Request:
- No JSON body.
- Uses the `ccSubcapRefreshToken` refresh cookie.

Success response body (`200`):
- `token` (string JWT)

Behavior notes:
- Rotates the refresh token cookie on every successful refresh.
- Extends refresh-cookie expiry by 30 days from the refresh event.

Failure modes:
- `401` missing, expired, revoked, or reused refresh cookie
- `500` authentication failure

### `GET /meta/cap-policy`
Success response body (`200`):
- `version` (number)
- `thresholds` (object)
  - `warningRatio` (number)
  - `criticalRatio` (number)
- `styles` (object)
  - `normal` / `warning` / `critical` (objects)
    - `background` (string color token)
    - `border` (string color token)
    - `text` (string color token)
- `cards` (object keyed by card name)
  - each entry has:
    - `mode` (`per-category` or `combined`)
    - `cap` (number)

Behavior notes:
- This endpoint is the backend-owned source of truth for cap display policy.
- Clients may cache the last successful policy and fall back to embedded defaults if unavailable.

### `GET /sync/data` (auth required)
Success response body (`200`) when no blob exists:
- `encryptedData` (`null`)
- `version` (`0`)

Success response body (`200`) when a blob exists:
- `encryptedData` (object)
  - `ciphertext` (base64 string)
  - `iv` (base64 string)
  - `salt` (base64 string)
  - `tag` (optional legacy base64 string)
- `version` (number)
- `updatedAt` (number, optional Unix timestamp)

Behavior notes:
- The encrypted transport envelope requires `ciphertext`, `iv`, and `salt`.
- Legacy `tag` values are still accepted and preserved when already stored.

Failure modes:
- `401` missing or invalid bearer token
- `500` sync read failure

### `PUT /sync/data` (auth required)
Request body:
- `encryptedData` (object)
  - `ciphertext` (base64 string, required)
  - `iv` (base64 string, required)
  - `salt` (base64 string, required)
  - `tag` (optional legacy base64 string)
- `version` (number, optimistic-lock version)

Success response body (`200`):
- `success` (boolean)
- `version` (number)

Conflict response body (`409`):
- `error` (`Version conflict`)
- `currentVersion` (number)

Behavior notes:
- This endpoint only persists encrypted sync blobs (`sync_blobs`).
- It does not create shared mapping contributions.
- Userscript sync payload remains under `data.cards` and is card-keyed.
- Current client behavior syncs only the active card from the current portal page while preserving other remote card keys.
- Synced card data is minimized to settings + aggregates (`selectedCategories`, `defaultCategory`, `merchantMap`, `monthlyTotals`) and excludes raw `transactions`.
- First-login/bootstrap restore is pull-only (`GET /sync/data`) and does not issue `PUT /sync/data` during the restore step.
- On `409 Version conflict`, client behavior is: pull latest remote state, perform client-side 3-way merge for active-card settings, and require explicit user choice for overlapping edits before retrying `PUT /sync/data`.

Failure modes:
- `400` invalid JSON or missing required encrypted fields
- `401` missing or invalid bearer token
- `409` optimistic-lock conflict
- `500` sync write failure

### `GET /shared/mappings/:cardType` (auth required)
Path param:
- `cardType` one of `ONE`, `LADY`, `PPV`, `SOLITAIRE`

Success response body (`200`):
- `mappings` (array of mapping objects)
  - `merchant` (string)
  - `merchantNormalized` (string)
  - `suggestedCategory` (string, canonical public field)
  - `category` (string, legacy alias of `suggestedCategory`)
  - `cardType` (string, uppercase)
  - `contributionCount` (number)
  - `lastUpdated` (number Unix timestamp)

Behavior notes:
- Public responses are camelCase, even though the backing D1 rows are snake_case.
- `cardType` is normalized to uppercase before lookup.

Failure modes:
- `400` invalid card type
- `401` missing or invalid bearer token
- `500` shared mapping read failure

### `POST /shared/mappings/contribute` (auth required)
Request body:
- `mappings` (array of objects)
  - one of `merchant`, `merchantRaw`, or `merchantNormalized` (string)
  - `suggestedCategory` (string, canonical public field)
  - `category` (string, optional legacy alias for `suggestedCategory`)
  - `cardType` (`ONE`, `LADY`, `PPV`, or `SOLITAIRE`; case-insensitive on input)

Success response body (`200`):
- `success` (boolean)
- `contributed` (number, optional)

Behavior notes:
- `suggestedCategory` is the canonical public request field.
- The backend still accepts legacy `category` in request payloads for backward compatibility.
- `cardType` accepts supported lowercase values, rejects unsupported values, and is normalized to uppercase before persistence.
- This is the only public API path that writes user mapping contributions (`mapping_contributions`).
- `shared_mappings` entries are created/updated via admin approval flows, which also normalize supported `cardType` values before persistence.

Failure modes:
- `400` invalid mapping payload
- `401` missing or invalid bearer token
- `500` contribution failure

## Required normalization and validation behavior

- Merchant normalization: lowercase, collapse internal whitespace to single spaces, trim, then remove characters not matching `[A-Za-z0-9_\s-]`.
- Canonical decrypted sync payload structure is defined by `schemas/sync-payload.schema.json`.
- Clients should remain backward compatible with known legacy decrypted payload layouts:
  - `{ cards: { ... } }`
  - `{ data: { cards: { ... } } }`
  - `{ "<CARD_NAME>": { selectedCategories, defaultCategory, merchantMap, ... } }`
- On successful sync using a legacy decrypted payload, clients should write back canonical envelope format on the next `PUT /sync/data` to migrate stored blobs.
- Shared mapping structure must validate against `schemas/shared-mapping.schema.json`.
- `suggestedCategory` is canonical for shared mapping interchange; `category` remains a supported alias where documented.
- Sync clients must derive decrypt keys using the payload `salt` field before AES-GCM decryption.

## Versioning

- Contract version follows repo commits.
- Breaking API changes must update this document and both schemas in the same pull request.
