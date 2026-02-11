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

## Required normalization and validation behavior

- Merchant normalization: lowercase, collapse internal whitespace to single spaces, trim, then remove characters not matching `[A-Za-z0-9_\s-]`.
- Sync payload structure must validate against `schemas/sync-payload.schema.json` after decryption.
- Shared mapping structure must validate against `schemas/shared-mapping.schema.json` for API-level interchange.

## Versioning

- Contract version follows repo commits.
- Breaking API changes must update this document and both schemas in the same pull request.
