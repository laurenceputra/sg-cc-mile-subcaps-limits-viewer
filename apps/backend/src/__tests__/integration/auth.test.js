/**
 * Integration Tests - Authentication Endpoints
 * Tests for /auth/register, /auth/login, /auth/logout, /auth/device*
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import app from '../../index.js';
import { 
  createTestDb, 
  cleanupTestDb, 
  createTestEnv,
  randomEmail,
  hashPassword,
  createTestUser
} from '../test-setup.js';

describe('Auth - Registration', () => {
  let db;
  let env;

  beforeEach(() => {
    db = createTestDb();
    env = createTestEnv();
  });

  afterEach(async () => {
    await cleanupTestDb(db);
  });

  test('should register a new user successfully', async () => {
    const email = randomEmail();
    const passwordHash = hashPassword('password123');

    const req = new Request('http://localhost/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ email, passwordHash })
    });

    const res = await app.fetch(req, { ...env, db });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.token).toBeDefined();
    expect(data.userId).toBeDefined();
    expect(data.tier).toBe('free');
  });

  test('should register with paid tier', async () => {
    const email = randomEmail();
    const passwordHash = hashPassword('password123');

    const req = new Request('http://localhost/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ email, passwordHash, tier: 'paid' })
    });

    const res = await app.fetch(req, { ...env, db });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.tier).toBe('paid');
  });

  test('should reject duplicate email registration', async () => {
    const email = randomEmail();
    const passwordHash = hashPassword('password123');

    // First registration
    const req1 = new Request('http://localhost/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ email, passwordHash })
    });
    await app.fetch(req1, { ...env, db });

    // Duplicate registration
    const req2 = new Request('http://localhost/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ email, passwordHash })
    });

    const res = await app.fetch(req2, { ...env, db });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe('Registration failed');
  });

  test('should reject invalid email format', async () => {
    const req = new Request('http://localhost/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ 
        email: 'not-an-email', 
        passwordHash: hashPassword('pass') 
      })
    });

    const res = await app.fetch(req, { ...env, db });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('email');
  });

  test('should reject missing password hash', async () => {
    const req = new Request('http://localhost/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ email: randomEmail() })
    });

    const res = await app.fetch(req, { ...env, db });

    expect(res.status).toBe(400);
  });

  test('should enforce rate limiting on registration', async () => {
    const requests = [];
    
    // Attempt 4 registrations (limit is 3 per minute)
    for (let i = 0; i < 4; i++) {
      const req = new Request('http://localhost/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://pib.uob.com.sg',
          'CF-Connecting-IP': '192.168.1.1'
        },
        body: JSON.stringify({ 
          email: randomEmail(), 
          passwordHash: hashPassword('pass') 
        })
      });
      requests.push(app.fetch(req, { ...env, db }));
    }

    const results = await Promise.all(requests);
    
    // First 3 should succeed or fail for other reasons
    // 4th should be rate limited
    const lastResult = results[results.length - 1];
    const lastData = await lastResult.json();

    expect(lastResult.status).toBe(429);
    expect(lastData.error).toContain('Too many');
  });
});

describe('Auth - Login', () => {
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

  test('should login with correct credentials', async () => {
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

    expect(res.status).toBe(200);
    expect(data.token).toBeDefined();
  });

  test('should reject incorrect password', async () => {
    const req = new Request('http://localhost/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ 
        email: testUser.email, 
        passwordHash: hashPassword('wrongpassword') 
      })
    });

    const res = await app.fetch(req, { ...env, db });
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error).toBe('Invalid credentials');
  });

  test('should reject non-existent user', async () => {
    const req = new Request('http://localhost/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ 
        email: randomEmail(), 
        passwordHash: hashPassword('pass') 
      })
    });

    const res = await app.fetch(req, { ...env, db });
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error).toBe('Invalid credentials');
  });

  test('should enforce rate limiting on login', async () => {
    const requests = [];
    const clientIp = '192.168.1.100';
    
    // Attempt 6 logins (limit is 5 per minute)
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
    const lastResult = results[results.length - 1];

    expect(lastResult.status).toBe(429);
  });

  test('should not apply progressive delay in Workers runtime', async () => {
    const startTime = Date.now();
    
    // Make 3 failed login attempts
    for (let i = 0; i < 3; i++) {
      const req = new Request('http://localhost/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://pib.uob.com.sg',
          'CF-Connecting-IP': '192.168.1.200'
        },
        body: JSON.stringify({ 
          email: testUser.email, 
          passwordHash: hashPassword('wrong') 
        })
      });
      await app.fetch(req, { ...env, db });
    }

    const elapsed = Date.now() - startTime;
    
    // Workers adapter disables progressive delay; keep this tight
    expect(elapsed).toBeLessThan(500);
  });
});

describe('Auth - Device Management', () => {
  let db;
  let env;
  let testUser;
  let token;

  beforeEach(async () => {
    db = createTestDb();
    env = createTestEnv();
    testUser = await createTestUser(db);
    
    // Get auth token
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

  test('should register a device', async () => {
    const req = new Request('http://localhost/auth/device/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ 
        deviceName: 'Test Device',
        deviceFingerprint: 'test-fingerprint-123'
      })
    });

    const res = await app.fetch(req, { ...env, db });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.deviceId).toBeDefined();
  });

  test('should list user devices', async () => {
    // Register a device first
    await db.registerDevice(testUser.userId, 'Test Device', 'fingerprint-1');
    
    const req = new Request('http://localhost/auth/devices', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pib.uob.com.sg'
      }
    });

    const res = await app.fetch(req, { ...env, db });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.devices).toBeDefined();
    expect(data.devices.length).toBeGreaterThan(0);
  });

  test('should revoke a device', async () => {
    const deviceId = await db.registerDevice(
      testUser.userId, 
      'Test Device', 
      'fingerprint-2'
    );

    const req = new Request(`http://localhost/auth/device/${deviceId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pib.uob.com.sg'
      }
    });

    const res = await app.fetch(req, { ...env, db });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });

  test('should enforce device limits for free tier', async () => {
    // Register 5 devices (free tier limit)
    for (let i = 0; i < 5; i++) {
      await db.registerDevice(
        testUser.userId, 
        `Device ${i}`, 
        `fingerprint-${i}`
      );
    }

    // Try to register 6th device
    const req = new Request('http://localhost/auth/device/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ 
        deviceName: 'Device 6',
        deviceFingerprint: 'fingerprint-6'
      })
    });

    const res = await app.fetch(req, { ...env, db });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('Device limit');
  });
});

describe('Auth - Logout', () => {
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

  test('should logout successfully', async () => {
    const req = new Request('http://localhost/auth/logout', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pib.uob.com.sg'
      }
    });

    const res = await app.fetch(req, { ...env, db });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });

  test('should reject logout without token', async () => {
    const req = new Request('http://localhost/auth/logout', {
      method: 'POST',
      headers: {
        'Origin': 'https://pib.uob.com.sg'
      }
    });

    const res = await app.fetch(req, { ...env, db });

    expect(res.status).toBe(401);
  });
});
