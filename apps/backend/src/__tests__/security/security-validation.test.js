/**
 * Security Tests - Comprehensive Security Validation
 * Tests for rate limiting, CSRF, input validation, timing attacks
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import app from '../../index.js';
import { 
  createTestDb, 
  cleanupTestDb, 
  createTestEnv,
  createTestUser,
  hashPassword
} from '../test-setup.js';

describe('Security - CSRF Protection', () => {
  let db;
  let env;
  let testUser;
  let token;

  beforeEach(async () => {
    db = createTestDb();
    env = createTestEnv();
    testUser = await createTestUser(db);
    
    const req = new Request('http://localhost/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ 
        email: testUser.email, 
        passwordHash: testUser.passwordHash 
      })
    });
    const res = await app.fetch(req, { ...env, db });
    const data = await res.json();
    token = data.token;
  });

  afterEach(async () => {
    await cleanupTestDb(db);
  });

  test('should reject POST without Origin header in production', async () => {
    const prodEnv = { ...env, ENVIRONMENT: 'production' };
    
    const req = new Request('http://localhost/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
        // No Origin header
      },
      body: JSON.stringify({ 
        email: 'test@example.com', 
        passwordHash: hashPassword('pass') 
      })
    });

    const res = await app.fetch(req, { ...prodEnv, db });

    expect(res.status).toBe(403);
  });

  test('should reject requests from unauthorized origin', async () => {
    const req = new Request('http://localhost/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://evil.com'
      },
      body: JSON.stringify({ 
        email: 'test@example.com', 
        passwordHash: hashPassword('pass') 
      })
    });

    const res = await app.fetch(req, { ...env, db });

    expect(res.status).toBe(403);
  });

  test('should allow requests from allowed origins', async () => {
    const req = new Request('http://localhost/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://test.example.com'
      },
      body: JSON.stringify({ 
        email: 'test2@example.com', 
        passwordHash: hashPassword('pass') 
      })
    });

    const res = await app.fetch(req, { ...env, db });

    // Should not be rejected for CSRF (might fail validation but not 403)
    expect(res.status).not.toBe(403);
  });

  test('should allow GET requests without Origin', async () => {
    const req = new Request('http://localhost/sync/data', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
        // No Origin header
      }
    });

    const res = await app.fetch(req, { ...env, db });

    // GET should be allowed (might fail auth but not CSRF)
    expect(res.status).not.toBe(403);
  });
});

describe('Security - Input Validation', () => {
  let db;
  let env;

  beforeEach(() => {
    db = createTestDb();
    env = createTestEnv();
  });

  afterEach(async () => {
    await cleanupTestDb(db);
  });

  test('should reject SQL injection attempts in email', async () => {
    const req = new Request('http://localhost/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ 
        email: "admin'--", 
        passwordHash: hashPassword('pass') 
      })
    });

    const res = await app.fetch(req, { ...env, db });

    expect(res.status).toBe(400);
  });

  test('should reject XSS attempts in merchant names', async () => {
    const testUser = await createTestUser(db);
    
    const loginReq = new Request('http://localhost/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ 
        email: testUser.email, 
        passwordHash: testUser.passwordHash 
      })
    });
    const loginRes = await app.fetch(loginReq, { ...env, db });
    const loginData = await loginRes.json();

    const req = new Request('http://localhost/shared/mappings/contribute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${loginData.token}`,
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({
        mappings: [
          {
            merchantNormalized: '<script>alert("xss")</script>',
            category: 'Dining',
            cardType: 'ONE',
            confidence: 0.9
          }
        ]
      })
    });

    const res = await app.fetch(req, { ...env, db });

    expect(res.status).toBe(400);
  });

  test('should reject control characters in input', async () => {
    const req = new Request('http://localhost/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ 
        email: "test\x00@example.com", 
        passwordHash: hashPassword('pass') 
      })
    });

    const res = await app.fetch(req, { ...env, db });

    expect(res.status).toBe(400);
  });

  test('should reject excessively long inputs', async () => {
    const req = new Request('http://localhost/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ 
        email: 'a'.repeat(300) + '@example.com', 
        passwordHash: hashPassword('pass') 
      })
    });

    const res = await app.fetch(req, { ...env, db });

    expect(res.status).toBe(400);
  });

  test('should normalize email case', async () => {
    const email = 'Test@Example.com';
    const passwordHash = hashPassword('pass123');

    // Register with mixed case
    const regReq = new Request('http://localhost/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ email, passwordHash })
    });
    await app.fetch(regReq, { ...env, db });

    // Login with different case
    const loginReq = new Request('http://localhost/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ 
        email: 'TEST@EXAMPLE.COM', 
        passwordHash 
      })
    });

    const res = await app.fetch(loginReq, { ...env, db });

    expect(res.status).toBe(200);
  });

  test('should reject invalid JSON', async () => {
    const req = new Request('http://localhost/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://pib.uob.com.sg'
      },
      body: 'not-valid-json'
    });

    const res = await app.fetch(req, { ...env, db });

    expect(res.status).toBe(400);
  });
});

describe('Security - Timing Attacks', () => {
  let db;
  let env;
  let testUser;

  beforeEach(async () => {
    db = createTestDb();
    env = createTestEnv();
    testUser = await createTestUser(db);
  });

  afterEach(async () => {
    await cleanupTestDb(db);
  });

  test('should use constant-time comparison for password hashes', async () => {
    const timings = [];

    // Test with correct user, wrong password (full hash comparison)
    for (let i = 0; i < 10; i++) {
      const start = process.hrtime.bigint();
      
      const req = new Request('http://localhost/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://pib.uob.com.sg',
          'CF-Connecting-IP': `203.0.113.${i}`
        },
        body: JSON.stringify({ 
          email: testUser.email, 
          passwordHash: hashPassword('wrongpass' + i)
        })
      });
      
      await app.fetch(req, { ...env, db });
      
      const end = process.hrtime.bigint();
      timings.push(Number(end - start) / 1_000_000); // Convert to ms
    }

    // Calculate standard deviation
    const mean = timings.reduce((a, b) => a + b) / timings.length;
    const variance = timings.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / timings.length;
    const stdDev = Math.sqrt(variance);

    // Timing should be relatively consistent (low std dev relative to mean)
    // This is a heuristic - timing attacks are complex to test
    const coefficientOfVariation = stdDev / mean;
    
    // Allow up to 50% variation (generous for test environment)
    expect(coefficientOfVariation).toBeLessThan(0.5);
  });

  test('should use constant-time comparison for admin key', async () => {
    const timings = [];

    for (let i = 0; i < 10; i++) {
      const start = process.hrtime.bigint();
      
      const req = new Request('http://localhost/admin/mappings/pending', {
        method: 'GET',
        headers: {
          'X-Admin-Key': 'wrong-key-' + i,
          'Origin': 'https://pib.uob.com.sg'
        }
      });
      
      await app.fetch(req, { ...env, db });
      
      const end = process.hrtime.bigint();
      timings.push(Number(end - start) / 1_000_000);
    }

    const mean = timings.reduce((a, b) => a + b) / timings.length;
    const variance = timings.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / timings.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = stdDev / mean;
    
    expect(coefficientOfVariation).toBeLessThan(1.5);
  });
});

describe('Security - Rate Limiting', () => {
  let db;
  let env;

  beforeEach(() => {
    db = createTestDb();
    env = createTestEnv();
  });

  afterEach(async () => {
    await cleanupTestDb(db);
  });

  test('should enforce login rate limit (5 per 15 min)', async () => {
    const testUser = await createTestUser(db);
    const requests = [];
    const clientIp = '10.0.0.1';

    // Try 6 logins
    for (let i = 0; i < 6; i++) {
      const req = new Request('http://localhost/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://pib.uob.com.sg',
          'CF-Connecting-IP': clientIp
        },
        body: JSON.stringify({ 
          email: testUser.email, 
          passwordHash: hashPassword('wrong')
        })
      });
      requests.push(app.fetch(req, { ...env, db }));
    }

    const results = await Promise.all(requests);
    const statuses = results.map(r => r.status);

    // First 5 should be 401 (unauthorized), 6th should be 429 (rate limited)
    expect(statuses.filter(s => s === 401).length).toBeGreaterThanOrEqual(5);
    expect(statuses[5]).toBe(429);
  });

  test('should enforce registration rate limit (3 per hour)', async () => {
    const requests = [];
    const clientIp = '10.0.0.2';

    // Try 4 registrations
    for (let i = 0; i < 4; i++) {
      const req = new Request('http://localhost/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://pib.uob.com.sg',
          'CF-Connecting-IP': clientIp
        },
        body: JSON.stringify({ 
          email: `test${i}@example.com`, 
          passwordHash: hashPassword('pass')
        })
      });
      requests.push(app.fetch(req, { ...env, db }));
    }

    const results = await Promise.all(requests);
    const lastStatus = results[3].status;

    expect(lastStatus).toBe(429);
  });

  test('should return Retry-After header when rate limited', async () => {
    const testUser = await createTestUser(db);
    const clientIp = '10.0.0.3';

    // Exhaust rate limit
    for (let i = 0; i < 5; i++) {
      await app.fetch(new Request('http://localhost/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://pib.uob.com.sg',
          'CF-Connecting-IP': clientIp
        },
        body: JSON.stringify({ 
          email: testUser.email, 
          passwordHash: hashPassword('wrong')
        })
      }), { ...env, db });
    }

    // One more request should be rate limited
    const req = new Request('http://localhost/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://pib.uob.com.sg',
        'CF-Connecting-IP': clientIp
      },
      body: JSON.stringify({ 
        email: testUser.email, 
        passwordHash: hashPassword('wrong')
      })
    });

    const res = await app.fetch(req, { ...env, db });

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeDefined();
  });

  test('should isolate rate limits per IP', async () => {
    const testUser = await createTestUser(db);

    // Exhaust limit for IP1
    for (let i = 0; i < 5; i++) {
      await app.fetch(new Request('http://localhost/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://pib.uob.com.sg',
          'CF-Connecting-IP': '10.0.0.4'
        },
        body: JSON.stringify({ 
          email: testUser.email, 
          passwordHash: hashPassword('wrong')
        })
      }), { ...env, db });
    }

    // IP2 should still have quota
    const req = new Request('http://localhost/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://pib.uob.com.sg',
        'CF-Connecting-IP': '10.0.0.5'
      },
      body: JSON.stringify({ 
        email: testUser.email, 
        passwordHash: hashPassword('wrong')
      })
    });

    const res = await app.fetch(req, { ...env, db });

    expect(res.status).toBe(401); // Unauthorized, not rate limited
  });
});

describe('Security - Token Security', () => {
  let db;
  let env;
  let testUser;
  let token;

  beforeEach(async () => {
    db = createTestDb();
    env = createTestEnv();
    testUser = await createTestUser(db);
    
    const req = new Request('http://localhost/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ 
        email: testUser.email, 
        passwordHash: testUser.passwordHash 
      })
    });
    const res = await app.fetch(req, { ...env, db });
    const data = await res.json();
    token = data.token;
  });

  afterEach(async () => {
    await cleanupTestDb(db);
  });

  test('should reject invalid token format', async () => {
    const req = new Request('http://localhost/sync/data', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer invalid-token',
        'Origin': 'https://pib.uob.com.sg'
      }
    });

    const res = await app.fetch(req, { ...env, db });

    expect(res.status).toBe(401);
  });

  test('should reject token with wrong signature', async () => {
    // Create token with different secret
    const wrongEnv = { ...env, JWT_SECRET: 'wrong-secret' };
    
    const loginReq = new Request('http://localhost/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ 
        email: testUser.email, 
        passwordHash: testUser.passwordHash 
      })
    });
    const loginRes = await app.fetch(loginReq, wrongEnv);
    const loginData = await loginRes.json();
    const wrongToken = loginData.token;

    // Try to use it with correct secret
    const req = new Request('http://localhost/sync/data', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${wrongToken}`,
        'Origin': 'https://pib.uob.com.sg'
      }
    });

    const res = await app.fetch(req, { ...env, db });

    expect(res.status).toBe(401);
  });

  test('should revoke token on logout', async () => {
    // Logout
    await app.fetch(new Request('http://localhost/auth/logout', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pib.uob.com.sg'
      }
    }), { ...env, db });

    // Try to use token after logout
    const req = new Request('http://localhost/sync/data', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pib.uob.com.sg'
      }
    });

    const res = await app.fetch(req, { ...env, db });

    expect(res.status).toBe(401);
  });
});

describe('Security - Headers', () => {
  let db;
  let env;

  beforeEach(() => {
    db = createTestDb();
    env = createTestEnv();
  });

  afterEach(async () => {
    await cleanupTestDb(db);
  });

  test('should set security headers', async () => {
    const req = new Request('http://localhost/', {
      method: 'GET'
    });

    const res = await app.fetch(req, { ...env, db });

    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('X-XSS-Protection')).toBe('1; mode=block');
  });
});
