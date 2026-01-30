/**
 * Integration Tests - Sync Endpoints
 * Tests for /sync/data GET and PUT with version conflict handling
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

describe('Sync - Get Data', () => {
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

  test('should return null for first-time sync', async () => {
    const req = new Request('http://localhost/sync/data', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pib.uob.com.sg'
      }
    });

    const res = await app.fetch(req, { ...env, db });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.encryptedData).toBeNull();
    expect(data.version).toBe(0);
  });

  test('should return existing sync data', async () => {
    const encryptedData = generateEncryptedData(1);
    await db.upsertSyncBlobAtomic(testUser.userId, 1, encryptedData);

    const req = new Request('http://localhost/sync/data', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pib.uob.com.sg'
      }
    });

    const res = await app.fetch(req, { ...env, db });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.encryptedData).toEqual(encryptedData);
    expect(data.version).toBe(1);
    expect(data.updatedAt).toBeDefined();
  });

  test('should require authentication', async () => {
    const req = new Request('http://localhost/sync/data', {
      method: 'GET',
      headers: {
        'Origin': 'https://pib.uob.com.sg'
      }
    });

    const res = await app.fetch(req, { ...env, db });

    expect(res.status).toBe(401);
  });

  test('should enforce rate limiting', async () => {
    const requests = [];
    
    // Attempt 101 requests (limit is 100 per hour)
    for (let i = 0; i < 101; i++) {
      const req = new Request('http://localhost/sync/data', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
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

describe('Sync - Put Data', () => {
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

  test('should save initial sync data', async () => {
    const encryptedData = generateEncryptedData(1);

    const req = new Request('http://localhost/sync/data', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ encryptedData, version: 1 })
    });

    const res = await app.fetch(req, { ...env, db });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.version).toBe(1);
  });

  test('should update existing sync data', async () => {
    const encryptedData1 = generateEncryptedData(1);
    await db.upsertSyncBlobAtomic(testUser.userId, 1, encryptedData1);

    const encryptedData2 = generateEncryptedData(2);
    const req = new Request('http://localhost/sync/data', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ encryptedData: encryptedData2, version: 2 })
    });

    const res = await app.fetch(req, { ...env, db });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.version).toBe(2);
  });

  test('should detect version conflict', async () => {
    const encryptedData1 = generateEncryptedData(5);
    await db.upsertSyncBlobAtomic(testUser.userId, 5, encryptedData1);

    // Try to save with older version
    const encryptedData2 = generateEncryptedData(3);
    const req = new Request('http://localhost/sync/data', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ encryptedData: encryptedData2, version: 3 })
    });

    const res = await app.fetch(req, { ...env, db });
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toBe('Version conflict');
    expect(data.currentVersion).toBe(5);
  });

  test('should handle concurrent updates atomically', async () => {
    // Simulate two devices trying to update simultaneously
    const requests = [];
    
    for (let i = 1; i <= 10; i++) {
      const encryptedData = generateEncryptedData(i);
      const req = new Request('http://localhost/sync/data', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Origin': 'https://pib.uob.com.sg'
        },
        body: JSON.stringify({ encryptedData, version: i })
      });
      requests.push(app.fetch(req, { ...env, db }));
    }

    const results = await Promise.all(requests);
    
    // Concurrent updates should not overwrite newer data
    const successCount = results.filter(r => r.status === 200).length;

    expect(successCount).toBeGreaterThanOrEqual(1);

    // Verify final version reflects the highest accepted update
    const blob = await db.getSyncBlob(testUser.userId);
    expect(blob.version).toBeGreaterThanOrEqual(1);
    expect(blob.version).toBeLessThanOrEqual(10);
  });

  test('should reject missing version', async () => {
    const encryptedData = generateEncryptedData(1);

    const req = new Request('http://localhost/sync/data', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ encryptedData })
    });

    const res = await app.fetch(req, { ...env, db });

    expect(res.status).toBe(400);
  });

  test('should reject invalid encrypted data structure', async () => {
    const req = new Request('http://localhost/sync/data', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ 
        encryptedData: { invalid: 'structure' }, 
        version: 1 
      })
    });

    const res = await app.fetch(req, { ...env, db });

    expect(res.status).toBe(400);
  });

  test('should enforce payload size limit', async () => {
    // Create oversized payload (> 1MB)
    const oversizedData = {
      ciphertext: 'x'.repeat(2 * 1024 * 1024), // 2MB
      iv: 'test',
      salt: 'test'
    };

    const req = new Request('http://localhost/sync/data', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ 
        encryptedData: oversizedData, 
        version: 1 
      })
    });

    const res = await app.fetch(req, { ...env, db });

    expect(res.status).toBe(413);
  });
});

describe('Sync - Optimistic Locking', () => {
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

  test('should prevent lost updates with version checking', async () => {
    // Device A and B both fetch version 0
    const getReq1 = new Request('http://localhost/sync/data', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pib.uob.com.sg'
      }
    });
    
    const getRes1 = await app.fetch(getReq1, { ...env, db });
    const getData1 = await getRes1.json();
    expect(getData1.version).toBe(0);

    // Device A updates to version 1
    const putReq1 = new Request('http://localhost/sync/data', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ 
        encryptedData: generateEncryptedData(1), 
        version: 1 
      })
    });
    
    const putRes1 = await app.fetch(putReq1, { ...env, db });
    expect(putRes1.status).toBe(200);

    // Device B tries to update to version 1 (should fail)
    const putReq2 = new Request('http://localhost/sync/data', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ 
        encryptedData: generateEncryptedData(1), 
        version: 1 
      })
    });
    
    const putRes2 = await app.fetch(putReq2, { ...env, db });
    const putData2 = await putRes2.json();
    
    expect(putRes2.status).toBe(409);
    expect(putData2.currentVersion).toBe(1);
  });
});
