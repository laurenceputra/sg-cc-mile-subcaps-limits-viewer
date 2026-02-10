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
4. Cloudflare Worker secrets for JWT and admin authentication

### Generate Secure Secrets

```bash
# OpenSSL (recommended)
openssl rand -base64 32

# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Python
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

### Generate Admin Login Hash

```bash
ADMIN_LOGIN_PEPPER="$(openssl rand -base64 32)"
ADMIN_LOGIN_PASSWORD_HASH="$(node -e 'const crypto=require("crypto");const password="your-admin-password";const pepper=process.env.ADMIN_LOGIN_PEPPER;console.log(crypto.createHash("sha256").update(password + ":" + pepper).digest("hex"))')"
```

## Setup

1. Install dependencies:
   ```bash
   npm --prefix apps/backend install
   ```
2. Authenticate with Cloudflare:
   ```bash
   wrangler login
   wrangler whoami
   ```
3. Create D1 database:
   ```bash
   wrangler d1 create bank_cc_sync
   ```
4. Update `wrangler.toml` with your D1 database ID.
5. Apply schema:
   ```bash
   wrangler d1 execute bank_cc_sync --file=apps/backend/src/storage/schema.sql
   ```
6. Set Worker secrets (repeat per environment):
   ```bash
   wrangler secret put JWT_SECRET --env preview
   wrangler secret put ADMIN_LOGIN_PEPPER --env preview
   wrangler secret put ADMIN_LOGIN_PASSWORD_HASH --env preview

   wrangler secret put JWT_SECRET --env production
   wrangler secret put ADMIN_LOGIN_PEPPER --env production
   wrangler secret put ADMIN_LOGIN_PASSWORD_HASH --env production
   ```
7. Confirm rate limiting bindings in `wrangler.toml` match your Cloudflare account.

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
npm --prefix apps/backend run deploy:preview
npm --prefix apps/backend run deploy:production
```

For production-specific settings, use `wrangler.toml` environments (e.g., `[env.production]`).

## GitHub Actions Deployments

Backend CI/CD uses GitHub Actions:

- **Preview:** `.github/workflows/backend-preview.yml` runs on PR updates, uploads a Worker Version with a preview alias, and comments with the version ID and preview URL.
- **Production:** `.github/workflows/backend-prod.yml` runs on `main` and requires GitHub Environment approval before deploying.

Preview deployments are isolated per PR using Worker preview aliases of the base script `bank-cc-sync` (not separate long-lived environment workers). Draft PRs and forks skip deployment, and `ready_for_review` or `workflow_dispatch` can trigger a preview run for same-repo branches.

Preview alias uploads require the base Worker to exist. If previews fail with missing worker errors, deploy once to preview or production to bootstrap the Worker, then retry the preview workflow.

With `CLOUDFLARE_WORKERS_SUBDOMAIN`, deterministic preview URLs follow:

`https://<alias>-bank-cc-sync.<subdomain>.workers.dev`

Workflows generate a `wrangler.ci.toml` at runtime using the D1 database IDs from GitHub Environment secrets.

Preview configs are rendered from `wrangler.preview.toml.template`, production from `wrangler.production.toml.template`.

### Preview vs Production Environments

- **Preview:** GitHub Environment `backend-preview`, Wrangler top-level preview template (base script `bank-cc-sync` + preview alias), D1 `bank_cc_sync_prod` (shared with production).
- **Production:** GitHub Environment `backend-production`, Wrangler env `production`, D1 `bank_cc_sync_prod`.

### D1 schema application policy

Both workflows apply `apps/backend/src/storage/schema.sql` on each deploy to keep preview and production schemas aligned.

### Rollback process

- **Preview:** re-run the PR workflow or deploy a prior version with `wrangler versions deploy --version-id <id> --percentage 100 --config apps/backend/wrangler.ci.toml`.
- **Production:** re-run the `backend-prod.yml` workflow from a prior commit or deploy a previous version with `wrangler versions deploy --env production --version-id <id> --percentage 100`.

### GitHub Environments and secrets

Create the GitHub Environments with these secrets:

- `backend-preview`: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `D1_PRODUCTION_DATABASE_ID`
- `backend-production`: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `D1_PRODUCTION_DATABASE_ID`

Required repository secret (for deterministic preview URLs in PR comments):

- `CLOUDFLARE_WORKERS_SUBDOMAIN` for deterministic preview URLs in PR comments.

JWT/admin secrets live only in Cloudflare Worker secrets (not GitHub).

Enable required reviewers (and optional wait timers) on `backend-production`.

### Secret rotation (Cloudflare Worker secrets)

Rotate secrets directly in Cloudflare and redeploy:

```bash
wrangler secret put JWT_SECRET --env preview
wrangler secret put JWT_SECRET --env production
wrangler secret put ADMIN_LOGIN_PEPPER --env preview
wrangler secret put ADMIN_LOGIN_PEPPER --env production
wrangler secret put ADMIN_LOGIN_PASSWORD_HASH --env preview
wrangler secret put ADMIN_LOGIN_PASSWORD_HASH --env production
```

Then re-run the preview or production deployment workflows.

## Monitoring & Maintenance

- Use Cloudflare Logs and Analytics for request and error monitoring.
- Scheduled cleanup runs via cron triggers configured in `wrangler.toml`.
- Rotate secrets periodically and review audit logs.

## Troubleshooting

- **Missing D1 binding:** ensure `[[d1_databases]]` is configured in `wrangler.toml`.
- **Invalid secrets:** set `JWT_SECRET`, `ADMIN_LOGIN_PASSWORD_HASH`, and `ADMIN_LOGIN_PEPPER` with `wrangler secret put`.
- **CSRF errors:** verify `ALLOWED_ORIGINS` and Origin headers in requests.

## Security Hardening Checklist

- Secrets are strong and stored via Wrangler secrets.
- `ALLOWED_ORIGINS` contains only approved HTTPS origins.
- Rate limiting bindings are enabled for auth, sync, user, and admin routes.
- No sensitive data is logged.
