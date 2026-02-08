# Bank CC Sync Backend

Optional sync backend for encrypted settings and shared mappings. Cloudflare Workers deployment only.

## 📚 Comprehensive Deployment Guide

**For detailed deployment instructions, troubleshooting, and production best practices, see:**
**[DEPLOYMENT.md](DEPLOYMENT.md)**

The deployment guide covers:
- Cloudflare Workers deployment (serverless)
- Production considerations and security hardening
- Monitoring, maintenance, and troubleshooting
- Environment configuration and scaling strategies

## Quick Start

Below are quick start instructions. For production deployments, see [DEPLOYMENT.md](DEPLOYMENT.md).

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

## API Endpoints

### Security Summary

Security controls (validation, CSRF, rate limits, audit logging, headers) are documented in:
**[SECURITY.md](SECURITY.md)**.

## Rate Limiting (Workers)

- Workers use Cloudflare Rate Limiting bindings configured in `wrangler.toml`.
- Workers limits are per-location; see `SECURITY.md` for configured windows.
- Rate limit keys are hashed with `JWT_SECRET` to avoid PII in keys.

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
2. **Keep secrets secure** - Use secrets management (Cloudflare secrets, Vault, etc.)
3. **Enable HTTPS** - Use TLS certificates in production
4. **Monitor audit logs** - Regularly review security events
5. **Rotate secrets periodically** - Change JWT_SECRET and ADMIN_KEY on a schedule
6. **Keep dependencies updated** - Run `npm audit` and update packages
7. **Use firewall rules** - Restrict admin endpoints to trusted IPs
