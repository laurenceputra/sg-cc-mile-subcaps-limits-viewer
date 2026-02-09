# Backend Deployment Guide (Cloudflare Workers + D1)

This backend runs **only** on Cloudflare Workers with D1 storage.

## Overview

- **Runtime:** Cloudflare Workers
- **Database:** Cloudflare D1
- **Rate limiting:** Cloudflare Rate Limiting bindings (see `wrangler.toml`)
- **Scheduled jobs:** Cloudflare Cron Triggers (`wrangler.toml`)

## Prerequisites

1. Cloudflare account
2. Node.js 20+
3. Wrangler CLI (`npm install -g wrangler`)
4. Secrets for JWT and admin authentication

### Generate Secure Secrets

```bash
# OpenSSL (recommended)
openssl rand -base64 32

# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Python
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

## Setup

1. Install dependencies:
   ```bash
   npm --prefix apps/backend install
   ```
2. Create D1 database:
   ```bash
   wrangler d1 create bank_cc_sync
   ```
3. Update `wrangler.toml` with your D1 database ID.
4. Apply schema:
   ```bash
   wrangler d1 execute bank_cc_sync --file=apps/backend/src/storage/schema.sql
   ```
5. Set secrets:
   ```bash
   wrangler secret put JWT_SECRET
   wrangler secret put ADMIN_KEY
   ```
6. Confirm rate limiting bindings in `wrangler.toml` match your Cloudflare account.

## Local Development

```bash
npm --prefix apps/backend run dev
```

Notes:
- `wrangler dev` uses local Miniflare/workerd and requires the D1 binding.
- Re-run the schema if you reset local D1 data.

## Deployment

```bash
npm --prefix apps/backend run deploy
```

For production-specific settings, use `wrangler.toml` environments (e.g., `[env.production]`).

## Monitoring & Maintenance

- Use Cloudflare Logs and Analytics for request and error monitoring.
- Scheduled cleanup runs via cron triggers configured in `wrangler.toml`.
- Rotate secrets periodically and review audit logs.

## Troubleshooting

- **Missing D1 binding:** ensure `[[d1_databases]]` is configured in `wrangler.toml`.
- **Invalid secrets:** set `JWT_SECRET` and `ADMIN_KEY` with `wrangler secret put`.
- **CSRF errors:** verify `ALLOWED_ORIGINS` and Origin headers in requests.

## Security Hardening Checklist

- Secrets are strong and stored via Wrangler secrets.
- `ALLOWED_ORIGINS` contains only approved HTTPS origins.
- Rate limiting bindings are enabled for auth, sync, user, and admin routes.
- No sensitive data is logged.
