# Sync API Contract

This directory documents the HTTP contract between:
- `apps/userscript/bank-cc-limits-subcap-calculator.user.js`
- `apps/backend`

Coupling is contract-only (HTTP + JSON schema). There is no shared runtime package.

## Endpoints

### `POST /auth/register`
Request body:
- `email` (string)
- `passwordHash` (string)
- `tier` (optional: `free` or `paid`)

Response body:
- `token` (string)
- `userId` (string)
- `tier` (`free` or `paid`)

### `POST /auth/login`
Request body:
- `email` (string)
- `passwordHash` (string)

Response body:
- `token` (string)
- `userId` (string)
- `tier` (`free` or `paid`)

Behavior notes:
- Sets a refresh token cookie (`ccSubcapRefreshToken`, HttpOnly, SameSite=Strict, Secure in production) scoped to `/auth`.

### `POST /auth/refresh`
Request:
- Uses the refresh token cookie (`ccSubcapRefreshToken`).

Response body:
- `token` (string)

Behavior notes:
- Rotates the refresh token on every refresh and extends expiry by 30 days.
- Returns `401` if the refresh token is missing, expired, revoked, or reused.

### `GET /meta/cap-policy`
Response body:
- `version` (number)
- `thresholds` (object)
  - `warningRatio` (number)
  - `criticalRatio` (number)
- `styles` (object)
  - `normal` / `warning` / `critical` (objects)
    - `background` (string color token)
    - `border` (string color token)
    - `text` (string color token)
- `cards` (object, keyed by card name)
  - each entry has:
    - `mode` (`per-category` or `combined`)
    - `cap` (number)

Behavior notes:
- This endpoint is the backend-owned source of truth for cap display policy.
- Current policy includes:
  - `LADY'S SOLITAIRE CARD`: per-category cap of `750`
  - `XL Rewards Card`: combined cap of `1000`
- Clients may cache the last successful policy and fallback to embedded defaults if unavailable.

### `GET /sync/data` (auth required)
Response body:
- `encryptedData` (object or `null`)
  - `ciphertext` (base64 string)
  - `iv` (base64 string)
  - `salt` (base64 string)
- `version` (number)
- `updatedAt` (number, optional)

### `PUT /sync/data` (auth required)
Request body:
- `encryptedData` (object)
  - `ciphertext` (base64 string)
  - `iv` (base64 string)
  - `salt` (base64 string)
- `version` (number, optimistic lock version)

Success response body:
- `success` (boolean)
- `version` (number)

Conflict response body (`409`):
- `error` (`Version conflict`)
- `currentVersion` (number)

Behavior notes:
- This endpoint only persists encrypted sync blobs (`sync_blobs`).
- It does not create shared mapping contributions.
- Userscript sync payload remains under `data.cards` and is card-keyed.
- Current client behavior syncs only the active card from the current portal page, while preserving other remote card keys.
- Synced card data is minimized to settings + aggregates (`selectedCategories`, `defaultCategory`, `merchantMap`, `monthlyTotals`) and excludes raw `transactions`.

### `GET /shared/mappings/:cardType` (auth required)
Path param:
- `cardType` one of `ONE`, `LADY`, `PPV`, `SOLITAIRE`

Response body:
- `mappings` (array of mapping objects)

### `POST /shared/mappings/contribute` (auth required)
Request body:
- `mappings` (array of objects)
  - `merchantRaw` (string)
  - `merchant` (string)
  - `merchantNormalized` (string)
  - `suggestedCategory` (string)
  - `cardType` (string)

Response body:
- `success` (boolean)
- `contributed` (number, optional)

Behavior notes:
- This is the only API path that writes user mapping contributions (`mapping_contributions`).
- `shared_mappings` entries are created/updated via admin approval flows, not direct user sync.

## Required normalization and validation behavior

- Merchant normalization: lowercase, collapse internal whitespace to single spaces, trim, then remove characters not matching `[A-Za-z0-9_\s-]`.
- Canonical sync payload structure is defined by `schemas/sync-payload.schema.json` after decryption.
- Clients should remain backward compatible with known legacy decrypted payload layouts:
  - `{ cards: { ... } }`
  - `{ "<CARD_NAME>": { selectedCategories, defaultCategory, merchantMap, ... } }`
- On successful sync using a legacy payload, clients should write back canonical envelope format on the next `PUT /sync/data` to migrate stored blobs.
- Shared mapping structure must validate against `schemas/shared-mapping.schema.json` for API-level interchange.
- Sync clients must derive decrypt keys using the payload `salt` field before AES-GCM decryption.

## Versioning

- Contract version follows repo commits.
- Breaking API changes must update this document and both schemas in the same pull request.
