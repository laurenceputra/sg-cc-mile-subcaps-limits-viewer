/**
 * Load Tests - Performance and Scalability Validation
 * Tests system behavior under concurrent load
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import app from '../../index.js';
import { 
  createTestDb, 
  cleanupTestDb, 
  createTestEnv,
  randomEmail,
  hashPassword,
  createTestUser,
  generateEncryptedData
} from '../test-setup.js';

describe('Load - Concurrent Authentication', () => {
  let db;
  let env;

  beforeEach(() => {
    db = createTestDb();
    env = createTestEnv();
  });

  afterEach(async () => {
    await cleanupTestDb(db);
  });

  test('should handle 100 concurrent registrations', async () => {
    const requests = [];

    for (let i = 0; i < 100; i++) {
      const req = new Request('http://localhost/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://pib.uob.com.sg',
          'CF-Connecting-IP': `192.168.1.${i % 256}`
        },
        body: JSON.stringify({ 
          email: randomEmail(), 
          passwordHash: hashPassword('pass123')
        })
      });
      requests.push(app.fetch(req, { ...env, db }));
    }

    const startTime = Date.now();
    const results = await Promise.all(requests);
    const duration = Date.now() - startTime;

    const successCount = results.filter(r => r.status === 200).length;
    const rateLimitedCount = results.filter(r => r.status === 429).length;

    // Most should succeed (rate limited from same IP ranges)
    expect(successCount).toBeGreaterThan(80);
    
    // Should complete in reasonable time (< 5 seconds)
    expect(duration).toBeLessThan(5000);

    console.log(`100 concurrent registrations: ${successCount} succeeded, ${rateLimitedCount} rate limited, ${duration}ms`);
  });

  test('should handle 100 concurrent logins', async () => {
    // Create test users
    const users = [];
    for (let i = 0; i < 10; i++) {
      users.push(await createTestUser(db));
    }

    const requests = [];

    for (let i = 0; i < 100; i++) {
      const user = users[i % users.length];
      const req = new Request('http://localhost/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://pib.uob.com.sg',
          'CF-Connecting-IP': `10.0.${Math.floor(i / 5)}.${i % 5}`
        },
        body: JSON.stringify({ 
          email: user.email, 
          passwordHash: user.passwordHash
        })
      });
      requests.push(app.fetch(req, { ...env, db }));
    }

    const startTime = Date.now();
    const results = await Promise.all(requests);
    const duration = Date.now() - startTime;

    const successCount = results.filter(r => r.status === 200).length;

    // Most should succeed
    expect(successCount).toBeGreaterThan(80);
    expect(duration).toBeLessThan(5000);

    console.log(`100 concurrent logins: ${successCount} succeeded, ${duration}ms`);
  });
});

describe('Load - Concurrent Sync Operations', () => {
  let db;
  let env;

  beforeEach(() => {
    db = createTestDb();
    env = createTestEnv();
  });

  afterEach(async () => {
    await cleanupTestDb(db);
  });

  test('should handle 1000 concurrent sync reads', async () => {
    // Create users with sync data
    const users = [];
    for (let i = 0; i < 10; i++) {
      const user = await createTestUser(db);
      await db.upsertSyncBlobAtomic(user.userId, 1, generateEncryptedData(1));
      
      // Get token
      const loginReq = new Request('http://localhost/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://pib.uob.com.sg'
        },
        body: JSON.stringify({ 
          email: user.email, 
          passwordHash: user.passwordHash
        })
      });
      const loginRes = await app.fetch(loginReq, { ...env, db });
      const loginData = await loginRes.json();
      user.token = loginData.token;
      
      users.push(user);
    }

    const requests = [];

    for (let i = 0; i < 1000; i++) {
      const user = users[i % users.length];
      const req = new Request('http://localhost/sync/data', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${user.token}`,
          'Origin': 'https://pib.uob.com.sg',
          'CF-Connecting-IP': `10.${Math.floor(i / 256)}.${Math.floor(i / 4) % 256}.${i % 4}`
        }
      });
      requests.push(app.fetch(req, { ...env, db }));
    }

    const startTime = Date.now();
    const results = await Promise.all(requests);
    const duration = Date.now() - startTime;

    const successCount = results.filter(r => r.status === 200).length;
    const rateLimitedCount = results.filter(r => r.status === 429).length;

    // Most should succeed
    expect(successCount).toBeGreaterThan(900);
    
    // Should complete in reasonable time (< 10 seconds)
    expect(duration).toBeLessThan(10000);

    console.log(`1000 concurrent reads: ${successCount} succeeded, ${rateLimitedCount} rate limited, ${duration}ms`);
  });

  test('should handle concurrent writes with version conflicts', async () => {
    const user = await createTestUser(db);
    
    const loginReq = new Request('http://localhost/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ 
        email: user.email, 
        passwordHash: user.passwordHash
      })
    });
    const loginRes = await app.fetch(loginReq, { ...env, db });
    const loginData = await loginRes.json();
    const token = loginData.token;

    // Simulate 50 devices trying to write simultaneously
    const requests = [];
    for (let i = 1; i <= 50; i++) {
      const req = new Request('http://localhost/sync/data', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Origin': 'https://pib.uob.com.sg',
          'CF-Connecting-IP': `10.0.0.${i}`
        },
        body: JSON.stringify({ 
          encryptedData: generateEncryptedData(i), 
          version: i 
        })
      });
      requests.push(app.fetch(req, { ...env, db }));
    }

    const startTime = Date.now();
    const results = await Promise.all(requests);
    const duration = Date.now() - startTime;

    const successCount = results.filter(r => r.status === 200).length;
    const conflictCount = results.filter(r => r.status === 409).length;

    // Only one should succeed due to atomic version checking
    expect(successCount).toBe(1);
    expect(conflictCount).toBe(49);

    // Verify data integrity
    const blob = await db.getSyncBlob(user.userId);
    expect(blob).not.toBeNull();
    expect(blob.version).toBeGreaterThanOrEqual(1);
    expect(blob.version).toBeLessThanOrEqual(50);

    console.log(`50 concurrent writes: ${successCount} succeeded, ${conflictCount} conflicts, ${duration}ms`);
  });

  test('should maintain performance under mixed load', async () => {
    // Create 5 users
    const users = [];
    for (let i = 0; i < 5; i++) {
      const user = await createTestUser(db);
      await db.upsertSyncBlobAtomic(user.userId, 1, generateEncryptedData(1));
      
      const loginReq = new Request('http://localhost/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://pib.uob.com.sg'
        },
        body: JSON.stringify({ 
          email: user.email, 
          passwordHash: user.passwordHash
        })
      });
      const loginRes = await app.fetch(loginReq, { ...env, db });
      const loginData = await loginRes.json();
      user.token = loginData.token;
      
      users.push(user);
    }

    const requests = [];

    // Mixed operations: 70% reads, 30% writes
    for (let i = 0; i < 100; i++) {
      const user = users[i % users.length];
      
      if (i % 10 < 7) {
        // Read
        const req = new Request('http://localhost/sync/data', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${user.token}`,
            'Origin': 'https://pib.uob.com.sg',
            'CF-Connecting-IP': `10.0.${Math.floor(i / 20)}.${i % 20}`
          }
        });
        requests.push(app.fetch(req, { ...env, db }));
      } else {
        // Write
        const currentBlob = await db.getSyncBlob(user.userId);
        const nextVersion = (currentBlob?.version || 0) + 1;
        
        const req = new Request('http://localhost/sync/data', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${user.token}`,
            'Origin': 'https://pib.uob.com.sg',
            'CF-Connecting-IP': `10.0.${Math.floor(i / 20)}.${i % 20}`
          },
          body: JSON.stringify({ 
            encryptedData: generateEncryptedData(nextVersion), 
            version: nextVersion 
          })
        });
        requests.push(app.fetch(req, { ...env, db }));
      }
    }

    const startTime = Date.now();
    const results = await Promise.all(requests);
    const duration = Date.now() - startTime;

    const successCount = results.filter(r => r.status === 200).length;

    expect(successCount).toBeGreaterThan(60);
    expect(duration).toBeLessThan(5000);

    console.log(`100 mixed operations: ${successCount} succeeded, ${duration}ms`);
  });
});

describe('Load - Rate Limit Behavior', () => {
  let db;
  let env;

  beforeEach(() => {
    db = createTestDb();
    env = createTestEnv();
  });

  afterEach(async () => {
    await cleanupTestDb(db);
  });

  test('rate limits should not affect legitimate different users', async () => {
    // Create 10 users
    const users = [];
    for (let i = 0; i < 10; i++) {
      users.push(await createTestUser(db));
    }

    // Each user makes 5 login attempts (within rate limit)
    const requests = [];
    for (let i = 0; i < 10; i++) {
      const user = users[i];
      for (let j = 0; j < 5; j++) {
        const req = new Request('http://localhost/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://pib.uob.com.sg',
            'CF-Connecting-IP': `10.0.0.${i}` // Different IPs
          },
          body: JSON.stringify({ 
            email: user.email, 
            passwordHash: user.passwordHash
          })
        });
        requests.push(app.fetch(req, { ...env, db }));
      }
    }

    const results = await Promise.all(requests);
    const successCount = results.filter(r => r.status === 200).length;
    const rateLimitedCount = results.filter(r => r.status === 429).length;

    // All should succeed (each user from different IP, within individual limits)
    expect(successCount).toBe(50);
    expect(rateLimitedCount).toBe(0);
  });

  test('rate limit should isolate abusive clients', async () => {
    const user = await createTestUser(db);

    // Abusive client from IP1 exhausts limit
    const abusiveRequests = [];
    for (let i = 0; i < 10; i++) {
      const req = new Request('http://localhost/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://pib.uob.com.sg',
          'CF-Connecting-IP': '10.0.0.1'
        },
        body: JSON.stringify({ 
          email: user.email, 
          passwordHash: hashPassword('wrong')
        })
      });
      abusiveRequests.push(app.fetch(req, { ...env, db }));
    }

    await Promise.all(abusiveRequests);

    // Legitimate user from different IP should still work
    const legitReq = new Request('http://localhost/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://pib.uob.com.sg',
        'CF-Connecting-IP': '10.0.0.2'
      },
      body: JSON.stringify({ 
        email: user.email, 
        passwordHash: user.passwordHash
      })
    });

    const legitRes = await app.fetch(legitReq, { ...env, db });

    expect(legitRes.status).toBe(200);
  });
});

describe('Load - Memory and Cleanup', () => {
  let db;
  let env;

  beforeEach(() => {
    db = createTestDb();
    env = createTestEnv();
  });

  afterEach(async () => {
    await cleanupTestDb(db);
  });

  test('should handle repeated operations without memory leak', async () => {
    const user = await createTestUser(db);
    
    const loginReq = new Request('http://localhost/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ 
        email: user.email, 
        passwordHash: user.passwordHash
      })
    });
    const loginRes = await app.fetch(loginReq, { ...env, db });
    const loginData = await loginRes.json();
    const token = loginData.token;

    const memoryBefore = process.memoryUsage().heapUsed;

    // Perform 1000 operations
    for (let i = 0; i < 1000; i++) {
      const req = new Request('http://localhost/sync/data', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Origin': 'https://pib.uob.com.sg',
          'CF-Connecting-IP': `10.0.${Math.floor(i / 256)}.${i % 256}`
        }
      });
      await app.fetch(req, { ...env, db });
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    const memoryAfter = process.memoryUsage().heapUsed;
    const memoryIncrease = memoryAfter - memoryBefore;
    const memoryIncreaseMB = memoryIncrease / 1024 / 1024;

    console.log(`Memory increase after 1000 operations: ${memoryIncreaseMB.toFixed(2)} MB`);

    // Memory increase should be reasonable (< 50 MB)
    expect(memoryIncreaseMB).toBeLessThan(50);
  });
});

describe('Load - Performance Benchmarks', () => {
  let db;
  let env;

  beforeEach(() => {
    db = createTestDb();
    env = createTestEnv();
  });

  afterEach(async () => {
    await cleanupTestDb(db);
  });

  test('measure average response times', async () => {
    const user = await createTestUser(db);
    await db.upsertSyncBlobAtomic(user.userId, 1, generateEncryptedData(1));
    
    const loginReq = new Request('http://localhost/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ 
        email: user.email, 
        passwordHash: user.passwordHash
      })
    });
    const loginRes = await app.fetch(loginReq, { ...env, db });
    const loginData = await loginRes.json();
    const token = loginData.token;

    const timings = {
      read: [],
      write: []
    };

    // Measure read performance
    for (let i = 0; i < 100; i++) {
      const start = process.hrtime.bigint();
      
      await app.fetch(new Request('http://localhost/sync/data', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Origin': 'https://pib.uob.com.sg',
          'CF-Connecting-IP': `10.0.0.${i % 256}`
        }
      }), { ...env, db });
      
      const end = process.hrtime.bigint();
      timings.read.push(Number(end - start) / 1_000_000); // ms
    }

    // Measure write performance
    for (let i = 0; i < 100; i++) {
      const version = i + 2;
      const start = process.hrtime.bigint();
      
      await app.fetch(new Request('http://localhost/sync/data', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Origin': 'https://pib.uob.com.sg',
          'CF-Connecting-IP': `10.0.0.${i % 256}`
        },
        body: JSON.stringify({ 
          encryptedData: generateEncryptedData(version), 
          version 
        })
      }), { ...env, db });
      
      const end = process.hrtime.bigint();
      timings.write.push(Number(end - start) / 1_000_000); // ms
    }

    const avgRead = timings.read.reduce((a, b) => a + b) / timings.read.length;
    const avgWrite = timings.write.reduce((a, b) => a + b) / timings.write.length;

    console.log(`Average read time: ${avgRead.toFixed(2)}ms`);
    console.log(`Average write time: ${avgWrite.toFixed(2)}ms`);

    // Performance targets
    expect(avgRead).toBeLessThan(50); // < 50ms average
    expect(avgWrite).toBeLessThan(100); // < 100ms average
  });
});
