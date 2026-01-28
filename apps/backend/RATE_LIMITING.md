# Rate Limiting System

## Overview

Comprehensive rate limiting middleware protecting all API endpoints from:
- **Brute force attacks** on authentication endpoints
- **DoS/DDoS attacks** via unlimited API requests
- **Resource exhaustion** through large payloads
- **User enumeration** via timing attacks

## Architecture

### Components

1. **Rate Limit Store** (`rate-limit-store.js`)
   - In-memory store compatible with Cloudflare Workers and Node.js
   - Tracks attempts, blocks, and expiry times per client
   - Automatic cleanup of expired entries
   - Production note: Consider Durable Objects (CF) or Redis (Node.js) for distributed deployments

2. **Configuration** (`rate-limit-config.js`)
   - Centralized rate limit settings
   - Progressive delay calculations
   - Generic error messages (prevents information leakage)

3. **Middleware** (`rate-limiter.js`)
   - Generic rate limiter factory
   - Pre-configured limiters for each endpoint type
   - Payload size validation
   - Progressive delay implementation

## Rate Limit Policies

### Login Endpoint
```javascript
{
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,        // 15 minutes
  blockDurationMs: 60 * 60 * 1000, // 1 hour block
  progressiveDelay: {
    baseMs: 200,
    maxMs: 5000,
    exponentialFactor: 2
  }
}
```

**Behavior:**
- 5 login attempts allowed per 15-minute window
- After 5th failed attempt, block for 1 hour
- Progressive delays: 0ms → 400ms → 800ms → 1600ms → 3200ms (capped at 5s)
- Generic error messages prevent username enumeration

### Registration Endpoint
```javascript
{
  maxAttempts: 3,
  windowMs: 60 * 60 * 1000,             // 1 hour
  blockDurationMs: 24 * 60 * 60 * 1000  // 24 hours
}
```

**Behavior:**
- 3 registration attempts per hour
- 24-hour block after exceeding limit
- Prevents spam account creation

### Sync Endpoints
```javascript
{
  maxRequests: 100,
  windowMs: 60 * 60 * 1000  // 1 hour
}
```

**Behavior:**
- 100 requests per hour per authenticated user
- Sufficient for normal sync patterns
- Prevents abuse of storage resources

### Shared Mappings
```javascript
{
  maxRequests: 20,
  windowMs: 60 * 1000  // 1 minute
}
```

**Behavior:**
- 20 requests per minute per user
- Allows frequent browsing/mapping lookups
- Prevents scraping of entire mapping database

### Admin Endpoints
```javascript
{
  maxRequests: 10,
  windowMs: 60 * 1000  // 1 minute
}
```

**Behavior:**
- Strict 10 requests/minute limit
- Protects sensitive administrative functions
- Combines with X-Admin-Key authentication

### Payload Size Limit
```javascript
{
  maxBytes: 1024 * 1024  // 1 MB
}
```

**Behavior:**
- Global 1MB payload limit on all requests
- Prevents memory exhaustion attacks
- Returns 413 Payload Too Large error

## Client Identification

Rate limits are tracked per client using:

1. **IP Address** (priority order):
   - `CF-Connecting-IP` header (Cloudflare)
   - `X-Forwarded-For` header (first IP)
   - `X-Real-IP` header
   - Fallback: "unknown"

2. **User ID** (for authenticated requests):
   - Combined with IP: `user:{userId}:{ip}`
   - Prevents authenticated users from bypassing limits via multiple IPs

## Response Headers

### Standard Rate Limit Headers
```
X-RateLimit-Limit: 5          // Max requests in window
X-RateLimit-Remaining: 3      // Requests left
X-RateLimit-Reset: 1703001600 // Unix timestamp when limit resets
```

### On Rate Limit Exceeded (429)
```
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1703001600
Retry-After: 3600             // Seconds until retry allowed
```

## Error Responses

All rate limit errors use generic messages to prevent information leakage:

### 429 Too Many Requests
```json
{
  "error": "Too many login attempts. Please try again later.",
  "retryAfter": 3600
}
```

### 413 Payload Too Large
```json
{
  "error": "Request payload too large",
  "maxSize": "1MB"
}
```

## Security Features

### 1. No User Enumeration
- Login errors are generic: "Invalid credentials"
- Registration errors: "Registration failed" (not "User already exists")
- Timing attacks mitigated by progressive delays

### 2. Progressive Delays
- Exponential backoff on repeated login attempts
- Slows brute force attacks significantly
- Formula: `baseMs * (exponentialFactor ^ (attempts - 1))`
- Example: 0ms → 400ms → 800ms → 1600ms → 3200ms (capped at 5s)

### 3. Block Duration Escalation
- Login: 1 hour block after 5 attempts
- Registration: 24 hour block after 3 attempts
- Prevents retry attacks

### 4. Payload Size Validation
- Checked before parsing request body
- Uses Content-Length header
- Prevents memory exhaustion

## Integration

### In index.js
```javascript
import { 
  payloadSizeLimitMiddleware,
  syncRateLimiter,
  sharedMappingsRateLimiter,
  adminRateLimiter
} from './middleware/rate-limiter.js';

// Global payload limit
app.use('/*', payloadSizeLimitMiddleware());

// Per-route rate limiting
app.use('/sync/*', authMiddleware, syncRateLimiter);
app.use('/shared/*', authMiddleware, sharedMappingsRateLimiter);
app.use('/admin/*', adminRateLimiter);
```

### In auth.js
```javascript
import { 
  loginRateLimiter, 
  registerRateLimiter, 
  progressiveDelayMiddleware 
} from '../middleware/rate-limiter.js';

auth.post('/login', loginRateLimiter, progressiveDelayMiddleware(), async (c) => {
  // Login logic
});

auth.post('/register', registerRateLimiter, async (c) => {
  // Registration logic
});
```

## Testing

### Test Rate Limits
```bash
# Test login rate limit
for i in {1..6}; do
  curl -X POST http://localhost:3000/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","passwordHash":"wrong"}' \
    -w "\nStatus: %{http_code}\n\n"
  sleep 1
done

# 6th attempt should return 429
```

### Test Progressive Delay
```bash
# Observe increasing response times
time curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","passwordHash":"wrong"}'
```

### Test Payload Limit
```bash
# Generate 2MB payload (should fail with 413)
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -H "Content-Length: 2097152" \
  --data-binary @large_file.json
```

## Production Considerations

### Cloudflare Workers
- In-memory store is per-worker instance
- For distributed edge: Use Cloudflare Durable Objects or KV
- Consider implementing rate limiting at Cloudflare firewall level for additional protection

### Node.js/Docker
- In-memory store works well for single instance
- For horizontal scaling: Use Redis with `ioredis` or `redis` package
- Example Redis adapter:
```javascript
class RedisRateLimitStore {
  constructor(redisClient) {
    this.redis = redisClient;
  }
  
  async increment(identifier, windowMs) {
    const key = `ratelimit:${identifier}`;
    const count = await this.redis.incr(key);
    
    if (count === 1) {
      await this.redis.expire(key, Math.ceil(windowMs / 1000));
    }
    
    return count;
  }
  // ... other methods
}
```

### Monitoring
Consider adding:
- Metrics for rate limit hits per endpoint
- Alerting on high block rates (possible attack)
- Logging of blocked IPs for security analysis
- Dashboard showing current rate limit usage

## Customization

### Adjusting Limits
Edit `apps/backend/src/middleware/rate-limit-config.js`:

```javascript
export const rateLimitConfig = {
  login: {
    maxAttempts: 10,  // Increase to 10 attempts
    windowMs: 30 * 60 * 1000,  // 30 minute window
    // ...
  }
};
```

### Adding New Rate Limiters
```javascript
// In rate-limit-config.js
export const rateLimitConfig = {
  // ...
  customEndpoint: {
    maxRequests: 50,
    windowMs: 60 * 1000
  }
};

// In rate-limiter.js
export const customRateLimiter = createRateLimiter(
  'customEndpoint', 
  rateLimitConfig.customEndpoint
);

// In index.js
app.use('/custom/*', customRateLimiter);
```

## Attack Mitigation Summary

| Attack Type | Mitigation |
|-------------|------------|
| Credential Stuffing | 5 attempts/15min, 1h block |
| Brute Force | Progressive delays + rate limits |
| User Enumeration | Generic error messages |
| Timing Attacks | Consistent response delays |
| DoS via API Spam | Per-endpoint rate limits |
| Payload Bombs | 1MB payload size limit |
| Distributed Attacks | IP-based tracking, cloudflare integration |
| Account Creation Spam | 3 registrations/hour, 24h block |

## Maintenance

### Reset Rate Limit (Testing/Admin)
```javascript
import { resetRateLimit } from './middleware/rate-limiter.js';

// Reset specific user's login limit
resetRateLimit('login', 'ip:192.168.1.1');
resetRateLimit('login', 'user:123:192.168.1.1');
```

### Store Cleanup
- Automatic cleanup runs every 5 minutes (Node.js only)
- Removes expired blocks and old entries
- Manual cleanup: `store.cleanup()`

## Compliance

This rate limiting implementation helps meet:
- **OWASP Top 10**: Addresses broken authentication (A07)
- **PCI DSS**: Account lockout after failed attempts
- **NIST 800-63B**: Progressive delays for authentication
- **GDPR**: No logging of sensitive user data in rate limiting
