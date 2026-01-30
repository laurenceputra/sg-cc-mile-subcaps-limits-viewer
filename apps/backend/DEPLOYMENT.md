# Backend Deployment Guide

This guide covers both **Node.js/Docker** and **Cloudflare Workers** deployment approaches for the Bank CC Sync Backend.

## Table of Contents

- [Overview](#overview)
- [Deployment Options Comparison](#deployment-options-comparison)
- [Prerequisites](#prerequisites)
- [Node.js/Docker Deployment](#nodejs-docker-deployment)
- [Cloudflare Workers Deployment](#cloudflare-workers-deployment)
- [Production Considerations](#production-considerations)
- [Monitoring & Maintenance](#monitoring--maintenance)
- [Troubleshooting](#troubleshooting)
- [Security Hardening Checklist](#security-hardening-checklist)

## Overview

The backend supports two deployment approaches:

1. **Node.js/Docker**: Self-hosted using Docker, ideal for full control and private infrastructure
2. **Cloudflare Workers**: Serverless deployment with global edge distribution

Both approaches share the same codebase and API endpoints but differ in:
- Database backend (SQLite for Node, D1 for Workers)
- Rate limiting implementation (in-memory/Redis for Node, Cloudflare Rate Limiting API for Workers)
- Scaling characteristics (vertical for Node, automatic for Workers)

## Deployment Options Comparison

| Feature | Node.js/Docker | Cloudflare Workers |
|---------|----------------|-------------------|
| **Hosting** | Self-hosted | Managed (Cloudflare) |
| **Database** | SQLite (local file) | D1 (distributed) |
| **Rate Limiting** | rate-limiter-flexible (memory or Redis) | Cloudflare Rate Limiting API |
| **Scaling** | Manual (vertical/horizontal) | Automatic (edge) |
| **Cost** | Server costs | Free tier + pay-as-you-go |
| **Latency** | Single region | Global edge locations |
| **Control** | Full control | Limited (serverless constraints) |
| **Setup Complexity** | Medium | Low |
| **Backup** | Manual (SQLite file) | Managed (D1 backups) |
| **Scheduled Jobs** | Node cron (node-cron) | Cloudflare Cron Triggers |

## Prerequisites

### Common Requirements

1. **Node.js 20+** for development and testing
2. **npm** package manager
3. **Strong secrets** for JWT and admin authentication

### Generate Secure Secrets

Before deploying to **any** environment, generate cryptographically secure secrets:

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
- Use different secrets for `JWT_SECRET` and `ADMIN_KEY`
- Store secrets securely (use secrets management systems, never commit to version control)
- Rotate secrets periodically (at least every 90 days)

### Node.js/Docker Additional Requirements

- **Docker** and **Docker Compose** installed
- Server with persistent storage for SQLite database
- (Optional) **Redis** instance for distributed rate limiting

### Cloudflare Workers Additional Requirements

- **Cloudflare account** (free tier available)
- **Wrangler CLI**: `npm install -g wrangler`
- Authenticated with Cloudflare: `wrangler login`

---

## Node.js/Docker Deployment

### 1. Prepare Environment

Clone the repository and navigate to the backend directory:

```bash
git clone https://github.com/laurenceputra/sg-cc-mile-subcaps-limits-viewer.git
cd sg-cc-mile-subcaps-limits-viewer/apps/backend
```

### 2. Configure Environment Variables

Create a `.env` file with your generated secrets:

```bash
# Required secrets
JWT_SECRET=<your-generated-jwt-secret-min-32-chars>
ADMIN_KEY=<your-generated-admin-key-min-32-chars>

# Environment configuration
NODE_ENV=production
ENVIRONMENT=production

# Database path (default: /data/bank-cc-sync.db in Docker)
DB_PATH=/data/bank-cc-sync.db

# CORS Configuration
ALLOWED_ORIGINS=https://pib.uob.com.sg,https://your-domain.com

# Optional: Redis for distributed rate limiting (recommended for multi-instance)
# REDIS_URL=redis://redis-server:6379

# Optional: Custom port (default: 3000)
# PORT=3000
```

**Important Notes:**
- In **production**, NEVER use default or weak secrets
- The `ALLOWED_ORIGINS` should include all domains that will access your backend
- Development mode automatically allows localhost origins
- For multi-instance deployments, use Redis for shared rate limiting state

### 3. Build and Run with Docker Compose

From the backend directory:

```bash
# Build the Docker image
docker-compose -f infra/docker/docker-compose.yml build

# Start the service (runs in background)
docker-compose -f infra/docker/docker-compose.yml up -d

# View logs
docker-compose -f infra/docker/docker-compose.yml logs -f

# Stop the service
docker-compose -f infra/docker/docker-compose.yml down
```

The server will:
- Start on port 3000 (configurable via PORT environment variable)
- Create SQLite database at `/data/bank-cc-sync.db` inside container
- Persist data in Docker volume `db-data`
- Run scheduled cleanup jobs daily at 2 AM UTC

### 4. Verify Deployment

```bash
# Health check
curl http://localhost:3000/

# Expected response:
# {"status":"ok","service":"bank-cc-sync"}

# Test authentication endpoint
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","passwordHash":"test-hash-123"}'
```

### 5. Alternative: Manual Node.js Deployment

If you prefer not to use Docker:

```bash
# Install dependencies
npm install --production

# Set environment variables (use .env file or export)
export JWT_SECRET="<your-secret>"
export ADMIN_KEY="<your-admin-key>"
export NODE_ENV="production"
export ENVIRONMENT="production"

# Run the server
npm run dev:node

# Or use PM2 for process management
npm install -g pm2
pm2 start src/node-server.js --name bank-cc-backend
pm2 save
pm2 startup
```

### 6. Production Setup with Reverse Proxy

For production, use a reverse proxy (Nginx, Caddy, Traefik) for:
- **HTTPS/TLS termination** (required for production)
- **Load balancing** (if running multiple instances)
- **Additional security headers**

Example Nginx configuration:

```nginx
server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 7. Database Backup (Node.js/Docker)

SQLite database is stored in the Docker volume. To backup:

```bash
# Find the volume path
docker volume inspect db-data

# Copy database file
docker cp $(docker-compose ps -q backend):/data/bank-cc-sync.db ./backup-$(date +%Y%m%d).db

# Or use docker-compose
docker-compose -f infra/docker/docker-compose.yml exec backend \
  cp /data/bank-cc-sync.db /data/backup-$(date +%Y%m%d).db
```

**Backup Schedule:**
- Daily automated backups recommended
- Keep at least 7 days of backups
- Test restore process regularly

---

## Cloudflare Workers Deployment

### 1. Install and Authenticate Wrangler

```bash
# Install Wrangler CLI globally
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Verify authentication
wrangler whoami
```

### 2. Create D1 Database

```bash
cd apps/backend

# Create database
wrangler d1 create bank_cc_sync

# Output will show:
# [[d1_databases]]
# binding = "DB"
# database_name = "bank_cc_sync"
# database_id = "xxxx-xxxx-xxxx-xxxx"

# Copy the database_id for next step
```

### 3. Configure wrangler.toml

Update `wrangler.toml` with your database ID:

```toml
name = "bank-cc-sync"
main = "src/cloudflare-worker.js"
compatibility_date = "2024-01-01"

# Scheduled cleanup jobs (daily at 2 AM UTC)
[triggers]
crons = ["0 2 * * *"]

# Production environment
[env.production]
vars = { ENVIRONMENT = "production" }

# D1 Database binding
[[d1_databases]]
binding = "DB"
database_name = "bank_cc_sync"
database_id = "YOUR_DATABASE_ID_HERE"  # ← Replace with your database ID

[vars]
ENVIRONMENT = "development"

# Rate limiting bindings (Cloudflare Rate Limiting API)
[[ratelimits]]
name = "RATE_LIMIT_LOGIN"
namespace_id = "1001"
simple = { limit = 5, period = 60 }

[[ratelimits]]
name = "RATE_LIMIT_REGISTER"
namespace_id = "1002"
simple = { limit = 3, period = 60 }

[[ratelimits]]
name = "RATE_LIMIT_SYNC"
namespace_id = "1003"
simple = { limit = 100, period = 60 }

[[ratelimits]]
name = "RATE_LIMIT_SHAREDMAPPINGS"
namespace_id = "1004"
simple = { limit = 20, period = 60 }

[[ratelimits]]
name = "RATE_LIMIT_LOGOUT"
namespace_id = "1005"
simple = { limit = 10, period = 60 }

[[ratelimits]]
name = "RATE_LIMIT_ADMIN"
namespace_id = "1006"
simple = { limit = 10, period = 60 }
```

### 4. Initialize Database Schema

```bash
# Apply schema to D1 database
wrangler d1 execute bank_cc_sync --file=src/storage/schema.sql

# Verify tables created
wrangler d1 execute bank_cc_sync --command="SELECT name FROM sqlite_master WHERE type='table';"
```

### 5. Set Secrets

Store secrets in Cloudflare (never in wrangler.toml):

```bash
# Set JWT secret (will prompt for value)
wrangler secret put JWT_SECRET

# Set admin key (will prompt for value)
wrangler secret put ADMIN_KEY

# Optional: Set allowed origins (if not using default)
wrangler secret put ALLOWED_ORIGINS
# Value example: https://pib.uob.com.sg,https://your-domain.com

# List configured secrets (without values)
wrangler secret list
```

**Security Notes:**
- Secrets are encrypted at rest by Cloudflare
- Secrets are environment-specific (dev vs production)
- Never log or expose secrets in code
- Rotate secrets using `wrangler secret put` to update

### 6. Test Locally

```bash
# Start local development server
npm run dev

# Or with Wrangler directly
wrangler dev

# Access at http://localhost:8787
# Test endpoints with curl or Postman
```

### 7. Deploy to Production

```bash
# Deploy to Cloudflare Workers
npm run deploy

# Or with Wrangler directly
wrangler deploy

# Deploy to specific environment
wrangler deploy --env production
```

**Deployment Output:**
```
Published bank-cc-sync (X.XX sec)
  https://bank-cc-sync.<your-subdomain>.workers.dev
```

### 8. Configure Custom Domain (Optional)

```bash
# Add custom domain route
wrangler routes add api.yourdomain.com/* bank-cc-sync

# Or via Cloudflare Dashboard:
# Workers > bank-cc-sync > Triggers > Routes > Add route
```

### 9. Monitor Deployment

```bash
# View real-time logs
wrangler tail

# View specific log level
wrangler tail --format=pretty

# View deployment details
wrangler deployments list
```

### 10. Database Backup (Cloudflare Workers)

D1 databases are automatically backed up by Cloudflare. To export manually:

```bash
# Export database to SQL
wrangler d1 export bank_cc_sync --output=backup-$(date +%Y%m%d).sql

# Or export specific tables
wrangler d1 execute bank_cc_sync --command=".dump" > backup.sql
```

---

## Production Considerations

### 1. Security Checklist

Before going live, verify:

- [ ] Strong, unique secrets for JWT_SECRET and ADMIN_KEY (min 32 chars)
- [ ] HTTPS/TLS enabled for all traffic
- [ ] ALLOWED_ORIGINS configured (no wildcards in production)
- [ ] Rate limiting enabled and tested
- [ ] Audit logging enabled and monitored
- [ ] Security headers configured (see SECURITY.md)
- [ ] No default credentials in use
- [ ] Database backups scheduled and tested
- [ ] Secrets stored in secure management system
- [ ] Error messages don't leak sensitive info

### 2. Environment Configuration

| Variable | Node.js/Docker | Cloudflare Workers | Required | Notes |
|----------|----------------|-------------------|----------|-------|
| `JWT_SECRET` | .env or env var | wrangler secret | **Yes** | Min 32 chars |
| `ADMIN_KEY` | .env or env var | wrangler secret | **Yes** | Min 32 chars |
| `ENVIRONMENT` | .env or env var | wrangler.toml vars | **Yes** | production/development |
| `NODE_ENV` | .env or env var | N/A | **Yes** (Node) | production/development |
| `ALLOWED_ORIGINS` | .env or env var | wrangler secret | Recommended | Comma-separated URLs |
| `DB_PATH` | .env or env var | N/A | No (Node) | Default: ./data/bank-cc-sync.db |
| `REDIS_URL` | .env or env var | N/A | No (Node) | For distributed rate limiting |
| `PORT` | .env or env var | N/A | No (Node) | Default: 3000 |

### 3. Rate Limiting Differences

**Node.js/Docker:**
- Uses `rate-limiter-flexible` library
- In-memory storage by default (per-instance)
- Redis backend for distributed rate limiting (multi-instance)
- Configurable windows (e.g., 15 minutes for login)
- Rate limit keys are hashed with JWT_SECRET

**Cloudflare Workers:**
- Uses Cloudflare Rate Limiting API
- Distributed across edge locations
- Per-location limits (eventually consistent)
- Fixed windows (10 or 60 seconds)
- Rate limit keys are hashed with JWT_SECRET

**See SECURITY.md for detailed rate limit configuration.**

### 4. Scheduled Jobs

**Node.js/Docker:**
- Runs `initCleanupSchedule()` on server start
- Uses node-cron for scheduling
- Daily cleanup at 2 AM UTC (configurable)
- Cleans expired tokens and rotates audit logs

**Cloudflare Workers:**
- Uses Cloudflare Cron Triggers
- Configured in `wrangler.toml` under `[triggers]`
- Runs `scheduled()` handler
- Daily cleanup at 2 AM UTC

### 5. Database Differences

**Node.js/Docker (SQLite):**
- Single file database
- ACID compliant
- Excellent for single-server deployments
- Manual backup required
- WAL mode for better concurrency
- Limited to single-server scaling

**Cloudflare Workers (D1):**
- Distributed SQLite-based database
- Eventually consistent
- Automatic backups by Cloudflare
- Global replication
- Scales automatically
- Read-after-write consistency for same request

### 6. Scaling Strategies

**Node.js/Docker Horizontal Scaling:**
1. Deploy multiple instances behind load balancer
2. Use Redis for shared rate limiting state
3. Ensure SQLite is on shared storage (NFS, EBS) or use replication
4. Configure session affinity if needed

**Node.js/Docker Vertical Scaling:**
1. Increase CPU/memory resources
2. Optimize SQLite settings (cache size, WAL)
3. Monitor database file growth

**Cloudflare Workers:**
- Automatic scaling (no configuration needed)
- Handles traffic spikes seamlessly
- Global edge distribution
- Rate limiting per-location

---

## Monitoring & Maintenance

### 1. Health Checks

**Node.js/Docker:**
```bash
# HTTP health check
curl http://localhost:3000/

# Docker health check (add to docker-compose.yml)
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

**Cloudflare Workers:**
```bash
# Workers health check
curl https://bank-cc-sync.<subdomain>.workers.dev/

# Monitor via Cloudflare Dashboard
# Workers > bank-cc-sync > Metrics
```

### 2. Logging

**Node.js/Docker:**
```bash
# View logs
docker-compose -f infra/docker/docker-compose.yml logs -f

# Or with PM2
pm2 logs bank-cc-backend

# Query audit logs directly
sqlite3 /data/bank-cc-sync.db "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 10;"
```

**Cloudflare Workers:**
```bash
# Real-time logs
wrangler tail

# Pretty format
wrangler tail --format=pretty

# Filter by status
wrangler tail --status=error
```

### 3. Audit Log Review

Review security events regularly:

```sql
-- Recent login failures
SELECT * FROM audit_logs 
WHERE event_type = 'login_failed' 
  AND created_at > strftime('%s', 'now', '-24 hours')
ORDER BY created_at DESC;

-- User registrations
SELECT * FROM audit_logs 
WHERE event_type = 'registration' 
  AND created_at > strftime('%s', 'now', '-7 days')
ORDER BY created_at DESC;

-- Admin actions
SELECT * FROM audit_logs 
WHERE event_type = 'admin_action' 
ORDER BY created_at DESC 
LIMIT 50;
```

### 4. Database Maintenance

**Node.js/Docker:**
```bash
# Vacuum database (compact and optimize)
sqlite3 /data/bank-cc-sync.db "VACUUM;"

# Analyze (update statistics for query optimizer)
sqlite3 /data/bank-cc-sync.db "ANALYZE;"

# Check integrity
sqlite3 /data/bank-cc-sync.db "PRAGMA integrity_check;"
```

**Cloudflare Workers:**
```bash
# D1 maintenance is handled by Cloudflare
# Manual optimization not typically needed

# Check table sizes
wrangler d1 execute bank_cc_sync --command="
  SELECT name, SUM(pgsize) as size 
  FROM dbstat 
  GROUP BY name 
  ORDER BY size DESC;"
```

### 5. Security Monitoring

**Daily:**
- Check failed login attempts (audit logs)
- Monitor rate limit triggers
- Review error logs for anomalies

**Weekly:**
- Audit new user registrations
- Review admin actions
- Check for dependency vulnerabilities: `npm audit`

**Monthly:**
- Rotate audit logs (automatic after 90 days)
- Review and update secrets rotation plan
- Test backup restoration

### 6. Performance Monitoring

**Node.js/Docker:**
```bash
# Monitor resource usage
docker stats

# Monitor with PM2
pm2 monit

# Database query performance
sqlite3 /data/bank-cc-sync.db "SELECT * FROM sqlite_master WHERE type='index';"
```

**Cloudflare Workers:**
- Use Cloudflare Dashboard > Workers > Analytics
- Monitor CPU time per request
- Check edge cache hit rates
- Review error rates and latency

---

## Troubleshooting

### Common Issues

#### 1. Server Won't Start (Node.js/Docker)

**Error:** "Failed to start server: JWT_SECRET is required"

**Solution:**
```bash
# Check environment variables are set
docker-compose -f infra/docker/docker-compose.yml config

# Ensure .env file exists and has required secrets
cat .env | grep -E 'JWT_SECRET|ADMIN_KEY'

# Restart with correct environment
docker-compose -f infra/docker/docker-compose.yml down
docker-compose -f infra/docker/docker-compose.yml up -d
```

#### 2. Deployment Fails (Cloudflare Workers)

**Error:** "D1 database not found"

**Solution:**
```bash
# Verify database exists
wrangler d1 list

# Check database_id in wrangler.toml matches
grep database_id wrangler.toml

# Re-create if needed
wrangler d1 create bank_cc_sync
wrangler d1 execute bank_cc_sync --file=src/storage/schema.sql
```

#### 3. CORS Errors

**Error:** "Origin not allowed"

**Solution:**
```bash
# Node.js: Check ALLOWED_ORIGINS in .env
echo $ALLOWED_ORIGINS

# Workers: Update secret
wrangler secret put ALLOWED_ORIGINS
# Enter: https://pib.uob.com.sg,https://your-domain.com

# Development: Set ENVIRONMENT=development to allow localhost
```

#### 4. Rate Limiting Issues

**Error:** "429 Too Many Requests"

**Solution:**
```bash
# Node.js: Check rate limit configuration
cat src/middleware/rate-limit-config.js

# Workers: Check wrangler.toml rate limit bindings
grep -A 3 "ratelimits" wrangler.toml

# Reset rate limits (Node with Redis)
redis-cli KEYS "rl:*" | xargs redis-cli DEL

# Wait for rate limit window to expire (typically 1-15 minutes)
```

#### 5. Database Locked (Node.js/SQLite)

**Error:** "database is locked"

**Solution:**
```bash
# Check for long-running transactions
sqlite3 /data/bank-cc-sync.db "PRAGMA wal_checkpoint(FULL);"

# Restart server
docker-compose -f infra/docker/docker-compose.yml restart

# If persistent, check for file permission issues
docker-compose -f infra/docker/docker-compose.yml exec backend ls -la /data/
```

#### 6. Secrets Not Working

**Error:** "Invalid JWT signature" or "Unauthorized"

**Solution:**
```bash
# Node.js: Verify secrets are set
docker-compose -f infra/docker/docker-compose.yml exec backend env | grep SECRET

# Workers: Check secrets are configured
wrangler secret list

# Re-generate and set new secrets
openssl rand -base64 32 | wrangler secret put JWT_SECRET
```

### Debug Mode

**Node.js:**
```bash
# Enable debug logging
export DEBUG=*
npm run dev:node

# Or with Docker
docker-compose -f infra/docker/docker-compose.yml exec backend sh
env | grep -i secret  # DON'T do this in production logs!
```

**Cloudflare Workers:**
```bash
# Enable verbose logging
wrangler dev --log-level debug

# Tail logs with details
wrangler tail --format=pretty
```

---

## Security Hardening Checklist

Use this checklist before production deployment:

### Pre-Deployment

- [ ] Generate strong secrets (min 32 chars, cryptographically secure)
- [ ] Configure ALLOWED_ORIGINS (no wildcards in production)
- [ ] Enable HTTPS/TLS for all traffic
- [ ] Set ENVIRONMENT=production and NODE_ENV=production
- [ ] Review and test rate limiting configuration
- [ ] Test audit logging functionality
- [ ] Verify security headers are set (see SECURITY.md)
- [ ] Test CSRF protection with cross-origin requests
- [ ] Run security tests: `npm run test:security`
- [ ] Scan for vulnerabilities: `npm audit --production`

### Post-Deployment

- [ ] Verify HTTPS certificate is valid
- [ ] Test authentication flow end-to-end
- [ ] Verify rate limiting triggers correctly
- [ ] Check audit logs are being created
- [ ] Test database backup and restore process
- [ ] Monitor logs for security events
- [ ] Set up alerts for failed authentications
- [ ] Document secrets rotation procedure
- [ ] Create incident response plan
- [ ] Schedule regular security reviews

### Ongoing Maintenance

- [ ] Rotate secrets every 90 days (at minimum)
- [ ] Review audit logs weekly
- [ ] Update dependencies monthly: `npm update`
- [ ] Test security patches before deployment
- [ ] Review OWASP Top 10 compliance quarterly
- [ ] Conduct penetration testing annually
- [ ] Update TLS certificates before expiry
- [ ] Review and update firewall rules

---

## Additional Resources

- **Main README**: [README.md](README.md) - API endpoints and basic setup
- **Security Reference**: [SECURITY.md](SECURITY.md) - Detailed security controls
- **Testing Guide**: [TESTING_CHECKLIST.md](TESTING_CHECKLIST.md) - Test procedures
- **Cloudflare Workers Docs**: https://developers.cloudflare.com/workers/
- **D1 Database Docs**: https://developers.cloudflare.com/d1/
- **rate-limiter-flexible**: https://github.com/animir/node-rate-limiter-flexible

---

## Support & Contributions

For issues or questions:
1. Check this deployment guide and SECURITY.md
2. Review troubleshooting section above
3. Search existing GitHub issues
4. Open a new issue with deployment environment details

**Security Issues**: Please report security vulnerabilities privately to the maintainers.

---

Last Updated: 2024-01-30
