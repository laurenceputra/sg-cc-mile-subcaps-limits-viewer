# Security Implementation Guide

This document describes the comprehensive security measures implemented in the backend API to protect against common web vulnerabilities.

## Table of Contents

1. [Input Validation](#input-validation)
2. [CSRF Protection](#csrf-protection)
3. [Content-Type Validation](#content-type-validation)
4. [Configuration](#configuration)
5. [Testing](#testing)
6. [Monitoring](#monitoring)

## Input Validation

All user inputs are validated against strict schemas to prevent injection attacks, DoS, and data integrity issues.

### Validation Rules

#### Email (`email`)
- **Type:** String
- **Max Length:** 254 characters (RFC 5321)
- **Format:** RFC 5321 compliant email regex
- **Restrictions:** No control characters (U+0000 to U+001F)
- **Example:** `user@example.com`

#### Password Hash (`passwordHash`)
- **Type:** String
- **Max Length:** 1024 characters
- **Format:** Alphanumeric, base64, or hex characters only
- **Restrictions:** No control characters
- **Example:** `5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8`

#### Merchant Name (`merchantName`)
- **Type:** String
- **Max Length:** 200 characters
- **Restrictions:** No control characters
- **Example:** `Starbucks Coffee #1234`

#### Category (`category`)
- **Type:** String
- **Max Length:** 100 characters
- **Restrictions:** No control characters, must be from allowed list
- **Allowed Values:**
  - `dining`
  - `groceries`
  - `transport`
  - `entertainment`
  - `shopping`
  - `travel`
  - `utilities`
  - `healthcare`
  - `education`
  - `fuel`
  - `online`
  - `contactless`
  - `excluded`
  - `others`
  - `general`
  - `unknown`
- **Example:** `dining`

#### Device Name (`deviceName`)
- **Type:** String
- **Max Length:** 100 characters
- **Restrictions:** No control characters
- **Example:** `My iPhone 15`

#### Device ID (`deviceId`)
- **Type:** String
- **Max Length:** 128 characters
- **Format:** Alphanumeric with hyphens and underscores only
- **Restrictions:** No control characters
- **Example:** `iphone-15-abc123`

#### Card Type (`cardType`)
- **Type:** String
- **Max Length:** 100 characters
- **Restrictions:** No control characters
- **Example:** `UOB One Card`

#### Tier (`tier`)
- **Type:** String
- **Allowed Values:** `free`, `paid`
- **Example:** `free`

#### Version (`version`)
- **Type:** Number (integer)
- **Range:** 0 to MAX_SAFE_INTEGER
- **Example:** `1`

#### Boolean (`boolean`)
- **Type:** Boolean
- **Allowed Values:** `true`, `false`
- **Example:** `true`

#### Encrypted Data (`encryptedData`)
- **Type:** Object
- **Required Fields:**
  - `iv` (string): Initialization vector
  - `ciphertext` (string): Encrypted data
  - `tag` (string, optional): Authentication tag
- **Max Size:** 1MB (JSON stringified)
- **Restrictions:** No control characters in string fields
- **Example:**
  ```json
  {
    "iv": "a1b2c3d4e5f6",
    "ciphertext": "encrypted_data_here",
    "tag": "auth_tag_here"
  }
  ```

#### Mappings Array (`mappingsArray`)
- **Type:** Array of objects
- **Max Items:** 100
- **Item Fields:**
  - `merchant` (string): Merchant name (validated as `merchantName`)
  - `category` (string): Category (validated as `category`)
  - `cardType` (string): Card type (validated as `cardType`)
- **Example:**
  ```json
  [
    {
      "merchant": "Starbucks",
      "category": "dining",
      "cardType": "UOB One Card"
    }
  ]
  ```

### Usage in Code

```javascript
import { validateFields, validateOptionalFields } from '../middleware/validation.js';

// Required fields
app.post('/endpoint',
  validateFields({
    email: 'email',
    passwordHash: 'passwordHash'
  }),
  async (c) => {
    const { email, passwordHash } = c.get('validatedBody');
    // ... handle request
  }
);

// Optional fields
app.post('/endpoint',
  validateOptionalFields({
    tier: 'tier'
  }),
  async (c) => {
    // ... handle request
  }
);
```

### Validation Errors

Validation errors return HTTP 400 with detailed error information:

```json
{
  "error": "Validation failed",
  "details": {
    "email": "Invalid email format",
    "category": "Category must be one of: dining, groceries, ..."
  }
}
```

## CSRF Protection

Cross-Site Request Forgery (CSRF) protection prevents unauthorized requests from malicious websites.

### How It Works

1. **Origin Header Validation:**
   - All state-changing requests (POST, PUT, PATCH, DELETE) validate the Origin header
   - Origin must match one of the allowed origins
   - Fallback to Referer header if Origin is not present

2. **Allowed Origins:**
   - Configured via `ALLOWED_ORIGINS` environment variable
   - Default: `https://pib.uob.com.sg`
   - Multiple origins can be comma-separated

3. **Development Mode:**
   - Automatically allows `localhost` and `127.0.0.1` when not in production
   - Enabled when `ENVIRONMENT` or `NODE_ENV` is not set to `production`

### Configuration

**Production:**
```bash
ALLOWED_ORIGINS=https://pib.uob.com.sg,https://your-domain.com
ENVIRONMENT=production
```

**Development:**
```bash
ALLOWED_ORIGINS=http://localhost:3000
ENVIRONMENT=development
```

### CSRF Errors

Invalid origin requests return HTTP 403:

```json
{
  "error": "Forbidden",
  "message": "CSRF validation failed: Invalid origin"
}
```

### CORS Integration

The CSRF protection is tightly integrated with CORS configuration:

```javascript
import { configureCors, csrfProtection } from './middleware/csrf.js';

// CORS with CSRF-aware origin validation
app.use('/*', configureCors({
  allowedOrigins: ['https://pib.uob.com.sg'],
  isDevelopment: false
}));

// CSRF protection for state-changing requests
app.use('/*', csrfProtection({
  allowedOrigins: ['https://pib.uob.com.sg'],
  requireOrigin: false,
  isDevelopment: false
}));
```

### Security Best Practices

1. **Always use HTTPS in production**
   - HTTP is vulnerable to man-in-the-middle attacks
   - Origin header can be spoofed over HTTP

2. **Whitelist only necessary origins**
   - Don't use wildcard (`*`) origins in production
   - Be specific about allowed domains

3. **Enable `requireOrigin` in production**
   - Reject requests without Origin/Referer headers
   - Maximum security at the cost of compatibility with older browsers

4. **Monitor rejected requests**
   - Log all CSRF validation failures
   - Analyze patterns to detect attack attempts

## Content-Type Validation

All POST, PUT, and PATCH requests must use `application/json` Content-Type.

### Validation Rules

- **Required Methods:** POST, PUT, PATCH
- **Required Header:** `Content-Type: application/json`
- **Error Response:** HTTP 415 (Unsupported Media Type)

### Error Example

```json
{
  "error": "Unsupported Media Type",
  "message": "Content-Type must be application/json"
}
```

### Implementation

The `validateJsonMiddleware()` automatically:
1. Checks Content-Type header
2. Parses JSON body
3. Validates JSON structure (max depth: 10 levels)
4. Stores parsed body in `c.get('validatedBody')`

## Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `ALLOWED_ORIGINS` | Comma-separated list of allowed origins for CSRF | `https://pib.uob.com.sg` | No |
| `ENVIRONMENT` | Environment name | - | No |
| `NODE_ENV` | Node environment | - | No |
| `JWT_SECRET` | Secret for JWT signing | `dev-secret` | Yes (production) |
| `ADMIN_KEY` | Admin API key | `admin-dev-key` | Yes (production) |

### Example Configuration Files

**Cloudflare Workers (wrangler.toml):**
```toml
[vars]
ALLOWED_ORIGINS = "https://pib.uob.com.sg,https://your-domain.com"
ENVIRONMENT = "production"
```

**Docker (.env):**
```bash
ALLOWED_ORIGINS=https://pib.uob.com.sg,https://your-domain.com
ENVIRONMENT=production
JWT_SECRET=your-random-secret-here
ADMIN_KEY=your-admin-key-here
```

## Testing

### Manual Testing

**Test Input Validation:**
```bash
# Test email validation
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "invalid", "passwordHash": "test"}'

# Expected: 400 Bad Request with validation error

# Test control character rejection
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com\u0000", "passwordHash": "test"}'

# Expected: 400 Bad Request
```

**Test CSRF Protection:**
```bash
# Test invalid origin
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -H "Origin: https://evil.com" \
  -d '{"email": "test@example.com", "passwordHash": "test"}'

# Expected: 403 Forbidden

# Test valid origin
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -H "Origin: https://pib.uob.com.sg" \
  -d '{"email": "test@example.com", "passwordHash": "test"}'

# Expected: 200 OK or 401 Unauthorized (if credentials invalid)
```

**Test Content-Type Validation:**
```bash
# Test missing Content-Type
curl -X POST http://localhost:3000/auth/register \
  -d '{"email": "test@example.com", "passwordHash": "test"}'

# Expected: 415 Unsupported Media Type

# Test invalid Content-Type
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: text/plain" \
  -d '{"email": "test@example.com", "passwordHash": "test"}'

# Expected: 415 Unsupported Media Type
```

### Automated Testing

Create a test script (`test-security.sh`):

```bash
#!/bin/bash

API_URL="http://localhost:3000"

echo "Testing Input Validation..."
# Add test cases here

echo "Testing CSRF Protection..."
# Add test cases here

echo "Testing Content-Type Validation..."
# Add test cases here
```

## Monitoring

### Logging

The security middleware logs important events:

```javascript
console.warn('[CSRF] Request rejected: Invalid origin: https://evil.com');
console.warn('[CSRF] Warning: Request without Origin/Referer header');
```

### Metrics to Monitor

1. **CSRF Rejections:**
   - Track frequency of 403 errors with CSRF messages
   - Alert on spike in rejections (possible attack)

2. **Validation Errors:**
   - Monitor 400 errors with validation failures
   - Identify patterns (e.g., repeated oversized inputs)

3. **Content-Type Errors:**
   - Track 415 errors
   - May indicate misconfigured clients

### Log Analysis

**Example queries for log aggregation tools:**

```
# Count CSRF rejections by origin
source="api" "CSRF" "rejected" | stats count by origin

# Find validation error patterns
source="api" status=400 "Validation failed" | stats count by error_field

# Detect DoS attempts (oversized inputs)
source="api" "exceeds maximum" | timechart count
```

## Attack Scenarios and Mitigations

### 1. Injection Attacks

**Attack:** Attacker sends control characters to break exports or inject code
```json
{"merchant": "Evil\u0000Corp\u001F"}
```

**Mitigation:** 
- All strings validated against `CONTROL_CHARS_REGEX`
- Returns 400 with clear error message

### 2. DoS via Large Inputs

**Attack:** Attacker sends 10MB merchant name
```json
{"merchant": "A".repeat(10_000_000)}
```

**Mitigation:**
- String length limits enforced (200 chars for merchant)
- Global payload size limit (1MB)
- Returns 400 or 413 (Payload Too Large)

### 3. CSRF Attack

**Attack:** Malicious website submits form to API
```html
<form action="https://api.example.com/auth/login" method="POST">
  <input name="email" value="victim@example.com">
  <input name="passwordHash" value="stolen_hash">
</form>
```

**Mitigation:**
- Origin header validation rejects requests from `evil.com`
- Returns 403 Forbidden

### 4. Category Whitelist Bypass

**Attack:** Attacker tries to inject arbitrary category
```json
{"category": "DROP TABLE users;--"}
```

**Mitigation:**
- Category validated against whitelist
- Returns 400 with list of allowed categories

### 5. JSON Bomb (Deeply Nested JSON)

**Attack:** Attacker sends deeply nested JSON to exhaust resources
```json
{"a": {"b": {"c": {"d": { ... (100 levels deep) }}}}}
```

**Mitigation:**
- JSON depth limited to 10 levels
- Parser rejects deeper structures
- Returns 400 with "JSON nesting too deep"

## Compliance

This implementation addresses requirements from:

- **OWASP Top 10:**
  - A03:2021 - Injection (via input validation)
  - A05:2021 - Security Misconfiguration (via CSRF)
  - A07:2021 - Identification and Authentication Failures (via rate limiting)

- **CWE (Common Weakness Enumeration):**
  - CWE-79: Cross-site Scripting (XSS)
  - CWE-89: SQL Injection
  - CWE-352: Cross-Site Request Forgery (CSRF)
  - CWE-400: Uncontrolled Resource Consumption

## Further Improvements

1. **Content Security Policy (CSP):**
   - Add CSP headers to prevent XSS
   - Restrict script sources

2. **Rate Limiting by IP:**
   - Currently rate-limited by identifier
   - Add IP-based rate limiting

3. **Request Signing:**
   - Implement HMAC signature for critical operations
   - Provides additional layer beyond CSRF

4. **Anomaly Detection:**
   - Monitor for unusual patterns
   - Automatic blocking of suspicious IPs

5. **Security Headers:**
   - Add `X-Content-Type-Options: nosniff`
   - Add `X-Frame-Options: DENY`
   - Add `Strict-Transport-Security`

## Support

For security concerns or questions, refer to:
- This document for implementation details
- `SECURITY_REVIEW.md` for security analysis
- `README.md` for configuration and deployment
