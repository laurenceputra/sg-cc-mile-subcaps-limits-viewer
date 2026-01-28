# Bank CC Sync Backend

Hono.js backend supporting both Cloudflare Workers and Docker deployment.

## Cloudflare Workers Deployment

### Prerequisites

**Generate Secure Secrets:**

Before deployment, generate strong secrets for JWT signing and admin authentication:

```bash
# Method 1: Using OpenSSL (recommended)
openssl rand -base64 32

# Method 2: Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Method 3: Using Python
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

**CRITICAL SECURITY REQUIREMENTS:**
- Secrets MUST be at least 32 characters
- NEVER use default values like 'dev-secret' or 'admin-dev-key' in production
- Use different secrets for JWT_SECRET and ADMIN_KEY
- Store secrets securely (never commit to version control)

### Deployment Steps

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

### Prerequisites

**Generate Secure Secrets (see instructions above in Cloudflare section)**

### Deployment Steps

1. Create `.env` file with generated secrets:
   ```bash
   JWT_SECRET=<your-generated-jwt-secret>
   ADMIN_KEY=<your-generated-admin-key>
   ENVIRONMENT=production
   ```

2. Start: `docker-compose up -d`

3. Database is persisted in Docker volume `db-data`

4. Access: `http://localhost:3000`

**IMPORTANT:** The server will refuse to start if JWT_SECRET or ADMIN_KEY are not set or are using insecure default values.

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
The API automatically sets comprehensive security headers:
- `X-Content-Type-Options: nosniff` - Prevents MIME sniffing
- `X-Frame-Options: DENY` - Prevents clickjacking
- `X-XSS-Protection: 1; mode=block` - Legacy XSS protection
- `Strict-Transport-Security: max-age=31536000` - Enforces HTTPS
- `Content-Security-Policy` - Restricts resource loading
- `Referrer-Policy: strict-origin-when-cross-origin` - Limits referrer leakage
- `Permissions-Policy` - Disables unnecessary browser APIs

The API also validates requests against CSRF attacks and sets appropriate CORS headers.

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

## Audit Logging

The backend automatically logs all security-relevant events:

**Logged Events:**
- Login attempts (success and failure)
- User registration
- Device registration/removal
- Data exports
- Settings changes
- Admin actions

**Log Details:**
- Timestamp
- Event type
- User ID (when applicable)
- IP address
- User agent
- Device ID (for device events)
- Sanitized event details (no passwords, tokens, or sensitive data)

**Log Retention:**
- Logs are automatically rotated after 90 days
- Old logs are permanently deleted
- Administrators can query logs for security review

**Privacy:**
- No passwords, tokens, or encryption keys are ever logged
- Only sanitized details are stored
- IP addresses are logged for forensics but can be anonymized if needed

## Security Best Practices

1. **Always use generated secrets** - Never use default values
2. **Keep secrets secure** - Use secrets management (Docker Secrets, Vault, etc.)
3. **Enable HTTPS** - Use TLS certificates in production
4. **Monitor audit logs** - Regularly review security events
5. **Rotate secrets periodically** - Change JWT_SECRET and ADMIN_KEY on a schedule
6. **Keep dependencies updated** - Run `npm audit` and update packages
7. **Use firewall rules** - Restrict admin endpoints to trusted IPs
