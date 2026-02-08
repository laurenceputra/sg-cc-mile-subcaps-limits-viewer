# Backend Security Reference

This document consolidates backend security controls, validation rules, and operational guidance.

## Overview

The backend enforces defense-in-depth controls:
- Input validation and normalization
- CSRF protection with Origin validation
- Content-Type enforcement and JSON depth limits
- Rate limiting with progressive delays
- Audit logging with retention and sanitization
- Security headers on all responses
- Startup validation for secrets

## Configuration (Required)

Set secrets and environment variables before running the server:

```bash
JWT_SECRET=<secure-random-secret>
ADMIN_KEY=<secure-random-secret>
ALLOWED_ORIGINS=https://pib.uob.com.sg,https://your-domain.com
ENVIRONMENT=production   # or development
NODE_ENV=production      # or development
```

Notes:
- Secrets must be non-empty and not default values.
- Development mode allows localhost origins automatically.

## Request Requirements

- **Content-Type:** `application/json` required for POST/PUT/PATCH/DELETE.
- **CSRF:** Origin header required in production for state-changing requests.
- **Payload size:** Maximum 1MB JSON payload.
- **JSON depth:** Max nesting depth is 10.
- **Auth:** Bearer token required for `/sync`, `/shared`, `/user`.
- **Admin:** `X-Admin-Key` header required for `/admin`.

## Input Validation Summary

| Field | Type | Max | Rules |
| --- | --- | --- | --- |
| `email` | string | 254 | RFC 5321 format, no control chars, disposable domains blocked |
| `passwordHash` | string | 1024 | Base64/hex-like, no control chars |
| `merchantName` | string | 200 | No control chars |
| `category` | string | 100 | Must match allowed list |
| `deviceName` | string | 100 | No control chars |
| `deviceId` | string | 128 | Alphanumeric + `_`/`-` |
| `cardType` | string | 100 | No control chars |
| `tier` | string | - | `free` or `paid` |
| `version` | int | - | 0 to MAX_SAFE_INTEGER |
| `shareMappings` | boolean | - | true/false |

### Encrypted Data (`encryptedData`)
```json
{ "iv": "string", "ciphertext": "string", "tag": "string?" }
```
- Object required with `iv` and `ciphertext`
- Optional `tag`
- String fields cannot contain control characters
- JSON size max 1MB

### Mappings Array (`mappings`)
- Array of up to 100 items
- Each item supports `merchant`, `category`, `cardType` with standard validation

## CSRF Protection

- Origin validation for all state-changing requests.
- Allowed origins via `ALLOWED_ORIGINS`.
- Development mode automatically allows localhost and 127.0.0.1.

## Rate Limiting

| Endpoint Type | Limit | Window | Block |
| --- | --- | --- | --- |
| Login | 5 attempts | 1 minute | 1 hour |
| Registration | 3 attempts | 1 minute | 24 hours |
| Sync | 100 requests | 1 minute | - |
| Shared mappings | 20 requests | 1 minute | - |
| Admin | 10 requests | 1 minute | - |
| Payload size | 1MB | - | - |

Login attempts include progressive delay (exponential backoff).

### Runtime differences
- **Workers:** Cloudflare Rate Limiting bindings in `wrangler.toml` (periods are 10 or 60 seconds, per-location).

### Rate limit keys
- Raw identifiers (email/IP/user agent/path) are hashed with `JWT_SECRET` before use to avoid PII in storage.

## Audit Logging

Audit logs capture security-relevant events:
- Login success/failure
- Registration
- Device registration/removal
- Data export/delete
- Settings changes
- Admin actions

Retention: **90 days**, with sensitive fields removed (passwords, tokens, secrets).

## Security Headers

Responses include:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security`
- `Content-Security-Policy`
- `Referrer-Policy`
- `Permissions-Policy`

## Testing

```bash
cd apps/backend
./scripts/test-security.sh
./scripts/test-rate-limiting-integration.sh
```
