# Security Implementation - Quick Reference

## Overview

The backend now implements **enterprise-grade security** with comprehensive input validation and CSRF protection. All API endpoints are protected against common web vulnerabilities.

## Key Features

✅ **Input Validation** - All user inputs validated against strict schemas
✅ **CSRF Protection** - Origin header validation prevents cross-site attacks  
✅ **Content-Type Validation** - Requires application/json for state-changing requests
✅ **DoS Prevention** - Length limits, JSON depth limiting, payload size limits
✅ **Data Integrity** - Category whitelists, format validation

## Quick Start

### Configuration

**Production Environment Variables:**
```bash
ALLOWED_ORIGINS=https://pib.uob.com.sg,https://your-domain.com
ENVIRONMENT=production
JWT_SECRET=your-secret-here
ADMIN_KEY=your-admin-key-here
```

**Development:**
```bash
# No configuration needed - localhost is automatically allowed
```

### Running Tests

```bash
cd apps/backend
./test-security.sh
```

## API Request Examples

### ✅ Valid Request
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -H "Origin: https://pib.uob.com.sg" \
  -d '{
    "email": "user@example.com",
    "passwordHash": "abc123def456"
  }'
```

**Response:** `200 OK`

---

### ❌ Invalid Email Format
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "not-an-email",
    "passwordHash": "abc123def456"
  }'
```

**Response:** `400 Bad Request`
```json
{
  "error": "Validation failed",
  "details": {
    "email": "Invalid email format"
  }
}
```

---

### ❌ Email Too Long
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "aaaaaaaaaa...@example.com",  # 255+ chars
    "passwordHash": "abc123def456"
  }'
```

**Response:** `400 Bad Request`
```json
{
  "error": "Validation failed",
  "details": {
    "email": "Email exceeds maximum length (254 characters)"
  }
}
```

---

### ❌ Invalid Category
```bash
curl -X POST http://localhost:3000/shared/mappings/contribute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{
    "mappings": [
      {
        "merchant": "Starbucks",
        "category": "invalid_category",
        "cardType": "UOB One"
      }
    ]
  }'
```

**Response:** `400 Bad Request`
```json
{
  "error": "Validation failed",
  "details": {
    "mappings": "Mapping item 0: Category must be one of: dining, groceries, transport, ..."
  }
}
```

---

### ❌ CSRF Attack (Invalid Origin)
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -H "Origin: https://evil.com" \
  -d '{
    "email": "user@example.com",
    "passwordHash": "abc123def456"
  }'
```

**Response:** `403 Forbidden`
```json
{
  "error": "Forbidden",
  "message": "CSRF validation failed: Invalid origin"
}
```

---

### ❌ Missing Content-Type
```bash
curl -X POST http://localhost:3000/auth/register \
  -d '{
    "email": "user@example.com",
    "passwordHash": "abc123def456"
  }'
```

**Response:** `415 Unsupported Media Type`
```json
{
  "error": "Unsupported Media Type",
  "message": "Content-Type must be application/json"
}
```

---

### ❌ Control Characters (Injection Prevention)
```bash
curl -X POST http://localhost:3000/shared/mappings/contribute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{
    "mappings": [
      {
        "merchant": "Evil\u0000Corp",  # null byte
        "category": "dining",
        "cardType": "Test"
      }
    ]
  }'
```

**Response:** `400 Bad Request`
```json
{
  "error": "Validation failed",
  "details": {
    "mappings": "Mapping item 0: Merchant name contains invalid control characters"
  }
}
```

---

## Validation Rules Summary

| Field | Max Length | Format | Special Rules |
|-------|-----------|--------|---------------|
| Email | 254 | RFC 5321 | No control chars |
| Password Hash | 1024 | Alphanumeric/base64/hex | No control chars |
| Merchant Name | 200 | Any | No control chars |
| Category | 100 | Any | Must be from whitelist (16 values) |
| Device Name | 100 | Any | No control chars |
| Device ID | 128 | Alphanumeric + `-_` | No control chars |
| Card Type | 100 | Any | No control chars |
| Tier | - | String | Must be 'free' or 'paid' |
| Version | - | Integer | Non-negative |

## Allowed Categories

```javascript
[
  'dining',
  'groceries',
  'transport',
  'entertainment',
  'shopping',
  'travel',
  'utilities',
  'healthcare',
  'education',
  'fuel',
  'online',
  'contactless',
  'excluded',
  'others',
  'general',
  'unknown'
]
```

## CSRF Protected Methods

- `POST` - All POST endpoints
- `PUT` - All PUT endpoints  
- `PATCH` - All PATCH endpoints
- `DELETE` - All DELETE endpoints

**Safe methods (no CSRF check):**
- `GET` - Read operations
- `HEAD` - Headers only
- `OPTIONS` - Preflight requests

## Default Allowed Origins

1. `https://pib.uob.com.sg` (UOB Personal Internet Banking)
2. Your self-hosted domain (configured via `ALLOWED_ORIGINS`)
3. `http://localhost:*` (development mode only)
4. `http://127.0.0.1:*` (development mode only)

## Error Response Codes

| Code | Meaning | Cause |
|------|---------|-------|
| 400 | Bad Request | Validation failed, invalid JSON |
| 403 | Forbidden | CSRF validation failed (invalid origin) |
| 415 | Unsupported Media Type | Missing/invalid Content-Type |

## Security Benefits

### Before Implementation
- ❌ No input validation - vulnerable to injection
- ❌ No CSRF protection - vulnerable to cross-site attacks
- ❌ No content-type validation - accepts any format
- ❌ No DoS prevention - accepts unlimited input sizes

### After Implementation
- ✅ Comprehensive input validation - prevents injection
- ✅ CSRF protection - prevents unauthorized cross-site requests
- ✅ Content-type validation - requires application/json
- ✅ DoS prevention - length limits, JSON depth limiting

### Attack Scenarios Prevented

1. **XSS via Control Characters:** ❌ Rejected
2. **SQL Injection via Category:** ❌ Rejected (whitelist)
3. **DoS via 10MB Merchant Name:** ❌ Rejected (200 char limit)
4. **CSRF from Malicious Site:** ❌ Rejected (origin validation)
5. **JSON Bomb (Deeply Nested):** ❌ Rejected (10 level limit)
6. **CSV Injection via Export:** ❌ Rejected (control chars blocked)

## Integration Examples

### JavaScript/TypeScript Frontend

```javascript
// Valid request
const response = await fetch('https://api.example.com/auth/register', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    // Origin header is automatically set by browser
  },
  body: JSON.stringify({
    email: 'user@example.com',
    passwordHash: 'abc123def456',
    tier: 'free'  // optional
  })
});

if (!response.ok) {
  const error = await response.json();
  console.error('Validation error:', error.details);
}
```

### Python Client

```python
import requests

response = requests.post(
    'https://api.example.com/auth/register',
    headers={
        'Content-Type': 'application/json',
        'Origin': 'https://pib.uob.com.sg'  # Required for CSRF
    },
    json={
        'email': 'user@example.com',
        'passwordHash': 'abc123def456'
    }
)

if response.status_code == 400:
    print('Validation error:', response.json()['details'])
elif response.status_code == 403:
    print('CSRF error:', response.json()['message'])
```

## Testing Checklist

- [ ] Test email validation (invalid format)
- [ ] Test email validation (too long)
- [ ] Test control character rejection
- [ ] Test category whitelist
- [ ] Test CSRF with invalid origin
- [ ] Test CSRF with valid origin
- [ ] Test missing Content-Type
- [ ] Test invalid Content-Type
- [ ] Test deeply nested JSON
- [ ] Test merchant name length limit

**Run all tests:**
```bash
cd apps/backend && ./test-security.sh
```

## Monitoring

### Log Messages to Monitor

**CSRF Rejections:**
```
[CSRF] Request rejected: Invalid origin: https://evil.com
```

**Action:** Investigate spike in rejections (possible attack)

**Missing Origin Header:**
```
[CSRF] Warning: Request without Origin/Referer header
```

**Action:** May indicate old browser or API client misconfiguration

### Metrics to Track

1. **CSRF rejection rate** (should be near 0 for legitimate traffic)
2. **Validation error rate** (high rate may indicate probing)
3. **Content-Type error rate** (indicates misconfigured clients)

## Documentation

- **`INPUT_VALIDATION_SECURITY.md`** - Comprehensive security guide
- **`SECURITY_IMPLEMENTATION_SUMMARY.md`** - Implementation details
- **`README.md`** - Quick start and configuration
- **`test-security.sh`** - Automated test suite

## Support

For issues or questions:
1. Check `INPUT_VALIDATION_SECURITY.md` for detailed explanations
2. Run `./test-security.sh` to verify configuration
3. Review error response for specific validation failures
4. Check logs for CSRF rejection patterns
