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

### Security Features

The backend implements comprehensive security protections:

**Input Validation:**
- RFC 5321 compliant email validation (max 254 chars)
- Merchant names: max 200 chars, no control characters
- Categories: max 100 chars, whitelist validation
- Device names/IDs: max 100/128 chars, alphanumeric only
- All strings: reject U+0000 to U+001F control characters
- JSON structure validation with depth limiting (max 10 levels)
- Encrypted data size limit: 1MB

**CSRF Protection:**
- Origin header validation for all state-changing requests
- Default allowed origins: `https://pib.uob.com.sg`
- Automatic localhost allowance in development mode
- 403 Forbidden response for invalid origins

**Content-Type Validation:**
- POST/PUT/PATCH require `application/json`
- Returns 415 Unsupported Media Type for invalid content types

**Configuration (Environment Variables):**
```bash
# CSRF Protection
ALLOWED_ORIGINS=https://pib.uob.com.sg,https://your-domain.com

# Environment
ENVIRONMENT=production  # or development
NODE_ENV=production     # or development
```

**Security Headers:**
The API automatically sets appropriate CORS headers based on allowed origins and validates all requests against CSRF attacks.

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
