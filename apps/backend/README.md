# Bank CC Sync Backend

Hono.js backend supporting both Cloudflare Workers and Docker deployment.

## Cloudflare Workers Deployment

1. Install Wrangler: `npm install -g wrangler`
2. Create D1 database: `wrangler d1 create bank_cc_sync`
3. Update `wrangler.toml` with database ID
4. Run schema: `wrangler d1 execute bank_cc_sync --file=src/storage/schema.sql`
5. Set secrets:
   ```bash
   wrangler secret put JWT_SECRET
   wrangler secret put ADMIN_KEY
   ```
6. Deploy: `npm run deploy`

## Docker Self-Hosting

1. Create `.env` file:
   ```
   JWT_SECRET=your-random-secret-here
   ADMIN_KEY=your-admin-key-here
   ```

2. Start: `docker-compose up -d`

3. Database is persisted in Docker volume `db-data`

4. Access: `http://localhost:3000`

## API Endpoints

### Rate Limits

All endpoints are protected with rate limiting to prevent abuse:

| Endpoint Type | Limit | Window | Block Duration |
|--------------|-------|--------|----------------|
| **Login** | 5 attempts | 15 minutes | 1 hour |
| **Registration** | 3 attempts | 1 hour | 24 hours |
| **Sync** | 100 requests | 1 hour | - |
| **Shared Mappings** | 20 requests | 1 minute | - |
| **Admin** | 10 requests | 1 minute | - |
| **Payload Size** | 1 MB max | - | - |

**Rate Limit Headers:**
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining in current window
- `X-RateLimit-Reset`: Unix timestamp when limit resets
- `Retry-After`: Seconds to wait before retrying (on 429 errors)

**Progressive Delays:**
Login attempts include exponential backoff starting at 200ms, preventing rapid brute force attacks.

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
