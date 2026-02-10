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

## GitHub Actions Deployments

Backend CI/CD uses GitHub Actions:

- **Preview:** `.github/workflows/backend-preview.yml` runs on PR updates, uploads a Worker Version, deploys it, and comments with the version ID and preview URL.
- **Production:** `.github/workflows/backend-prod.yml` runs on `main` and requires GitHub Environment approval before deploying.

Preview deployments are shared and the most recent PR deploy wins.

### Preview vs Production Environments

- **Preview:** GitHub Environment `backend-preview`, Wrangler env `preview`, D1 `bank_cc_sync_preview`.
- **Production:** GitHub Environment `backend-production`, Wrangler env `production`, D1 `bank_cc_sync_prod`.

### D1 schema application policy

Both workflows apply `apps/backend/src/storage/schema.sql` on each deploy to keep preview and production schemas aligned.

### Rollback process

- **Preview:** re-run the PR workflow or deploy a prior version with `wrangler versions deploy --env preview --version-id <id> --percentage 100`.
- **Production:** re-run the `backend-prod.yml` workflow from a prior commit or deploy a previous version with `wrangler versions deploy --env production --version-id <id> --percentage 100`.

### GitHub Environments and secrets

Create the GitHub Environments with these secrets:

- `backend-preview`: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `JWT_SECRET`, `ADMIN_KEY`
- `backend-production`: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `JWT_SECRET`, `ADMIN_KEY`

Enable required reviewers (and optional wait timers) on `backend-production`.

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
