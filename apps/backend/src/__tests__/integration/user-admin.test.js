/**
 * Integration Tests - User & Admin Endpoints
 * Tests for /user/* and /admin/* endpoints
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import app from '../../index.js';
import { 
  createTestDb, 
  cleanupTestDb, 
  createTestEnv,
  createTestUser,
  generateEncryptedData
} from '../test-setup.js';

describe('User - Data Management', () => {
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

  test('should export user data', async () => {
    // Add some data
    const encryptedData = generateEncryptedData(1);
    await db.upsertSyncBlobAtomic(testUser.userId, 1, encryptedData);
    await db.registerDevice(testUser.userId, 'Test Device', 'fingerprint-1');

    const req = new Request('http://localhost/user/export', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pib.uob.com.sg'
      }
    });

    const res = await app.fetch(req, { ...env, db });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.syncData).toEqual(encryptedData);
    expect(data.devices).toBeDefined();
    expect(data.devices.length).toBeGreaterThan(0);
    expect(data.exportedAt).toBeDefined();
  });

  test('should delete user data (GDPR compliance)', async () => {
    // Add some data
    await db.upsertSyncBlobAtomic(testUser.userId, 1, generateEncryptedData(1));
    await db.registerDevice(testUser.userId, 'Test Device', 'fingerprint-1');

    const req = new Request('http://localhost/user/data', {
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

    // Verify data is deleted
    const blob = await db.getSyncBlob(testUser.userId);
    const devices = await db.getDevicesByUser(testUser.userId);
    
    expect(blob).toBeNull();
    expect(devices.length).toBe(0);
  });

  test('should update user settings', async () => {
    const req = new Request('http://localhost/user/settings', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ shareMappings: false })
    });

    const res = await app.fetch(req, { ...env, db });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);

    // Verify settings updated
    const user = await db.getUserById(testUser.userId);
    expect(user.share_mappings).toBe(0); // SQLite boolean
  });

  test('should reject invalid settings', async () => {
    const req = new Request('http://localhost/user/settings', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ shareMappings: 'not-a-boolean' })
    });

    const res = await app.fetch(req, { ...env, db });

    expect(res.status).toBe(400);
  });
});

describe('Admin - Moderation', () => {
  let db;
  let env;

  beforeEach(() => {
    db = createTestDb();
    env = createTestEnv();
  });

  afterEach(async () => {
    await cleanupTestDb(db);
  });

  test('should require admin key', async () => {
    const req = new Request('http://localhost/admin/mappings/pending', {
      method: 'GET',
      headers: {
        'Origin': 'https://pib.uob.com.sg'
      }
    });

    const res = await app.fetch(req, { ...env, db });

    expect(res.status).toBe(401);
  });

  test('should reject invalid admin key', async () => {
    const req = new Request('http://localhost/admin/mappings/pending', {
      method: 'GET',
      headers: {
        'X-Admin-Key': 'wrong-key',
        'Origin': 'https://pib.uob.com.sg'
      }
    });

    const res = await app.fetch(req, { ...env, db });

    expect(res.status).toBe(401);
  });

  test('should get pending contributions', async () => {
    // Add a pending contribution
    const testUser = await createTestUser(db);
    await db.contributeMappings(testUser.userId, [
      {
        merchantNormalized: 'TEST_MERCHANT',
        category: 'Dining',
        cardType: 'ONE',
        confidence: 0.9
      }
    ]);

    const req = new Request('http://localhost/admin/mappings/pending', {
      method: 'GET',
      headers: {
        'X-Admin-Key': env.ADMIN_KEY,
        'Origin': 'https://pib.uob.com.sg'
      }
    });

    const res = await app.fetch(req, { ...env, db });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.pending).toBeDefined();
    expect(Array.isArray(data.pending)).toBe(true);
  });

  test('should approve mappings', async () => {
    const req = new Request('http://localhost/admin/mappings/approve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': env.ADMIN_KEY,
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({
        merchantNormalized: 'TEST_MERCHANT',
        category: 'Dining',
        cardType: 'ONE'
      })
    });

    const res = await app.fetch(req, { ...env, db });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });

  test('should check cleanup health', async () => {
    const req = new Request('http://localhost/admin/health/cleanup', {
      method: 'GET',
      headers: {
        'X-Admin-Key': env.ADMIN_KEY,
        'Origin': 'https://pib.uob.com.sg'
      }
    });

    const res = await app.fetch(req, { ...env, db });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.isHealthy).toBeDefined();
  });

  test('should enforce admin rate limiting', async () => {
    const requests = [];
    
    // Attempt 11 requests (limit is 10 per minute)
    for (let i = 0; i < 11; i++) {
      const req = new Request('http://localhost/admin/mappings/pending', {
        method: 'GET',
        headers: {
          'X-Admin-Key': env.ADMIN_KEY,
          'Origin': 'https://pib.uob.com.sg',
          'CF-Connecting-IP': '192.168.1.1'
        }
      });
      requests.push(app.fetch(req, { ...env, db }));
    }

    const results = await Promise.all(requests);
    const lastResult = results[results.length - 1];

    expect(lastResult.status).toBe(429);
  });
});

describe('Shared Mappings - Contributions', () => {
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

  test('should contribute mappings', async () => {
    const req = new Request('http://localhost/shared/mappings/contribute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({
        mappings: [
          {
            merchantNormalized: 'TEST_MERCHANT',
            category: 'Dining',
            cardType: 'ONE',
            confidence: 0.9
          }
        ]
      })
    });

    const res = await app.fetch(req, { ...env, db });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.contributed).toBe(1);
  });

  test('should get shared mappings', async () => {
    // Add an approved mapping
    await db.approveMappings('TEST_MERCHANT', 'Dining', 'ONE');

    const req = new Request('http://localhost/shared/mappings/ONE', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pib.uob.com.sg'
      }
    });

    const res = await app.fetch(req, { ...env, db });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.mappings).toBeDefined();
    expect(Array.isArray(data.mappings)).toBe(true);
  });

  test('should validate card type parameter', async () => {
    const req = new Request('http://localhost/shared/mappings/INVALID<script>', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pib.uob.com.sg'
      }
    });

    const res = await app.fetch(req, { ...env, db });

    expect(res.status).toBe(400);
  });

  test('should respect paid user sharing settings', async () => {
    // Create paid user
    const paidUser = await createTestUser(db, { tier: 'paid' });
    await db.updateUserSettings(paidUser.userId, false); // Disable sharing
    
    // Get token for paid user
    const loginReq = new Request('http://localhost/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ 
        email: paidUser.email, 
        passwordHash: paidUser.passwordHash 
      })
    });
    const loginRes = await app.fetch(loginReq, { ...env, db });
    const loginData = await loginRes.json();
    const paidToken = loginData.token;

    // Try to contribute
    const req = new Request('http://localhost/shared/mappings/contribute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${paidToken}`,
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({
        mappings: [
          {
            merchantNormalized: 'TEST',
            category: 'Dining',
            cardType: 'ONE',
            confidence: 0.9
          }
        ]
      })
    });

    const res = await app.fetch(req, { ...env, db });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.message).toContain('disabled');
  });
});
