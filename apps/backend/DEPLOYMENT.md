# Bank CC Sync Backend Deployment (Cloudflare Workers)

This backend is Workers-only. The instructions below cover D1 setup, secrets, deployment, and basic operations.

## Prerequisites

- Wrangler CLI installed and authenticated:
  ```bash
  npm install -g wrangler
  wrangler login
  ```

## 1) Create the D1 database

```bash
wrangler d1 create bank_cc_sync
```

Update `wrangler.toml` with the returned database ID.

## 2) Apply schema

```bash
wrangler d1 execute bank_cc_sync --file=src/storage/schema.sql
```

## 3) Set secrets

Generate strong secrets (32+ chars) and store them with Wrangler:

```bash
wrangler secret put JWT_SECRET
wrangler secret put ADMIN_KEY
```

Optional (recommended) secrets:

```bash
wrangler secret put ALLOWED_ORIGINS
```

## 4) Deploy

```bash
npm run deploy
```

## 5) Local development

```bash
npm run dev
```

## Operations

### Verify deployment

```bash
wrangler deployments list
```

### View logs

```bash
wrangler tail
```

### Database checks

```bash
wrangler d1 execute bank_cc_sync --command="SELECT name FROM sqlite_master WHERE type='table';"
```

### Backup

```bash
wrangler d1 export bank_cc_sync --output=backup-$(date +%Y%m%d).sql
```

## Security reminders

- Never commit secrets to the repo.
- Keep `JWT_SECRET` and `ADMIN_KEY` distinct and rotated periodically.
- Configure `ALLOWED_ORIGINS` to trusted domains for production.
- Review `SECURITY.md` for validation, rate limiting, and audit logging details.
