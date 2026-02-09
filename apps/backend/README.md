# Bank CC Sync Backend

Optional sync backend for encrypted settings and shared mappings. Runs on **Cloudflare Workers + D1** only.

## App boundary

- Backend code is self-contained under `apps/backend/`.
- Client integration contract is documented in `apps/contracts/sync-api.md` and `apps/contracts/schemas/`.

## 📚 Deployment guide

For full deployment instructions, see **[DEPLOYMENT.md](DEPLOYMENT.md)**.

## Quick start (Cloudflare Workers)

1. Install dependencies:
   ```bash
   npm --prefix apps/backend install
   ```
2. Install Wrangler: `npm install -g wrangler`
3. Create D1 database: `wrangler d1 create bank_cc_sync`
4. Update `wrangler.toml` with the database ID.
5. Run schema:
   ```bash
   wrangler d1 execute bank_cc_sync --file=src/storage/schema.sql
   ```
6. Set secrets:
   ```bash
   wrangler secret put JWT_SECRET
   wrangler secret put ADMIN_KEY
   ```
7. Start locally: `npm --prefix apps/backend run dev`
8. Deploy: `npm --prefix apps/backend run deploy`

## Testing

Workers-only tests:
```bash
npm --prefix apps/backend test
```

## Rate limiting (Workers)

- Cloudflare Rate Limiting bindings configured in `wrangler.toml`.
- Limits are per-location and enforced at the edge.
- Rate-limit keys are hashed with `JWT_SECRET` to avoid PII in keys.

## API Endpoints

### Security Summary

Security controls (validation, CSRF, rate limits, audit logging, headers) are documented in:
**[SECURITY.md](SECURITY.md)**.

### Auth
- `POST /auth/register` - Create account
- `POST /auth/login` - Login and get JWT
- `POST /auth/device/register` - Register device

### Sync (requires auth)
- `GET /sync/data` - Get encrypted sync data
- `PUT /sync/data` - Update encrypted sync data

### Shared Mappings (requires auth)
- `GET /shared/mappings/:cardType` - Get shared merchant mappings
- `POST /shared/mappings/contribute` - Contribute merchant mappings

### User (requires auth)
- `DELETE /user/data` - Delete all user data
- `GET /user/export` - Export user data
- `PATCH /user/settings` - Update user settings

### Admin (requires X-Admin-Key header)
- `GET /admin/mappings/pending` - Get pending contributions
- `POST /admin/mappings/approve` - Approve mapping

## Audit Logging

The backend automatically logs all security-relevant events:

- Login attempts (success and failure)
- User registration
- Device registration/removal
- Data exports
- Settings changes
- Admin actions

## Security Best Practices

1. Always use generated secrets.
2. Store secrets securely (Wrangler secrets or a secrets manager).
3. Enable HTTPS in production.
4. Monitor audit logs.
5. Rotate secrets periodically.
6. Keep dependencies updated (`npm audit`).
