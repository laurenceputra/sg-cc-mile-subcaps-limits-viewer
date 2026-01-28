/**
 * End-to-End Tests - Complete Sync Flow
 * Tests the complete user journey from registration to sync
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import app from '../../index.js';
import { 
  createTestDb, 
  cleanupTestDb, 
  createTestEnv,
  randomEmail,
  hashPassword,
  generateEncryptedData
} from '../test-setup.js';

describe('E2E - Complete User Journey', () => {
  let db;
  let env;

  beforeEach(() => {
    db = createTestDb();
    env = createTestEnv();
  });

  afterEach(async () => {
    await cleanupTestDb(db);
  });

  test('complete flow: register → login → device → sync → logout', async () => {
    const email = randomEmail();
    const password = 'secure-password-123';
    const passwordHash = hashPassword(password);

    // Step 1: Register
    const registerRes = await app.fetch(new Request('http://localhost/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ email, passwordHash })
    }), { ...env, db });

    expect(registerRes.status).toBe(200);
    const registerData = await registerRes.json();
    expect(registerData.token).toBeDefined();
    const token = registerData.token;

    // Step 2: Register device
    const deviceRes = await app.fetch(new Request('http://localhost/auth/device/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({
        deviceName: 'Primary Device',
        deviceFingerprint: 'device-fp-123'
      })
    }), { ...env, db });

    expect(deviceRes.status).toBe(200);
    const deviceData = await deviceRes.json();
    expect(deviceData.deviceId).toBeDefined();

    // Step 3: Upload initial sync data
    const encryptedData1 = generateEncryptedData(1);
    const syncUploadRes = await app.fetch(new Request('http://localhost/sync/data', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ encryptedData: encryptedData1, version: 1 })
    }), { ...env, db });

    expect(syncUploadRes.status).toBe(200);

    // Step 4: Download sync data
    const syncDownloadRes = await app.fetch(new Request('http://localhost/sync/data', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pib.uob.com.sg'
      }
    }), { ...env, db });

    expect(syncDownloadRes.status).toBe(200);
    const syncData = await syncDownloadRes.json();
    expect(syncData.encryptedData).toEqual(encryptedData1);
    expect(syncData.version).toBe(1);

    // Step 5: Update sync data
    const encryptedData2 = generateEncryptedData(2);
    const syncUpdateRes = await app.fetch(new Request('http://localhost/sync/data', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ encryptedData: encryptedData2, version: 2 })
    }), { ...env, db });

    expect(syncUpdateRes.status).toBe(200);

    // Step 6: Export data
    const exportRes = await app.fetch(new Request('http://localhost/user/export', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pib.uob.com.sg'
      }
    }), { ...env, db });

    expect(exportRes.status).toBe(200);
    const exportData = await exportRes.json();
    expect(exportData.syncData).toEqual(encryptedData2);
    expect(exportData.devices.length).toBeGreaterThan(0);

    // Step 7: Logout
    const logoutRes = await app.fetch(new Request('http://localhost/auth/logout', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pib.uob.com.sg'
      }
    }), { ...env, db });

    expect(logoutRes.status).toBe(200);

    // Step 8: Verify token is revoked
    const afterLogoutRes = await app.fetch(new Request('http://localhost/sync/data', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pib.uob.com.sg'
      }
    }), { ...env, db });

    expect(afterLogoutRes.status).toBe(401);
  });

  test('multi-device sync scenario', async () => {
    const email = randomEmail();
    const passwordHash = hashPassword('password123');

    // Register user
    const registerRes = await app.fetch(new Request('http://localhost/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ email, passwordHash })
    }), { ...env, db });

    const registerData = await registerRes.json();
    const token = registerData.token;

    // Device 1: Upload data
    const encryptedData1 = generateEncryptedData(1);
    await app.fetch(new Request('http://localhost/sync/data', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ encryptedData: encryptedData1, version: 1 })
    }), { ...env, db });

    // Device 2: Login and fetch
    const loginRes = await app.fetch(new Request('http://localhost/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ email, passwordHash })
    }), { ...env, db });

    const loginData = await loginRes.json();
    const token2 = loginData.token;

    const syncRes = await app.fetch(new Request('http://localhost/sync/data', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token2}`,
        'Origin': 'https://pib.uob.com.sg'
      }
    }), { ...env, db });

    const syncData = await syncRes.json();
    expect(syncData.encryptedData).toEqual(encryptedData1);
    expect(syncData.version).toBe(1);

    // Device 2: Update
    const encryptedData2 = generateEncryptedData(2);
    await app.fetch(new Request('http://localhost/sync/data', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token2}`,
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ encryptedData: encryptedData2, version: 2 })
    }), { ...env, db });

    // Device 1: Fetch updated data
    const updatedSyncRes = await app.fetch(new Request('http://localhost/sync/data', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pib.uob.com.sg'
      }
    }), { ...env, db });

    const updatedSyncData = await updatedSyncRes.json();
    expect(updatedSyncData.encryptedData).toEqual(encryptedData2);
    expect(updatedSyncData.version).toBe(2);
  });

  test('conflict resolution scenario', async () => {
    const email = randomEmail();
    const passwordHash = hashPassword('password123');

    // Setup user
    const registerRes = await app.fetch(new Request('http://localhost/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ email, passwordHash })
    }), { ...env, db });

    const { token } = await registerRes.json();

    // Device A: Upload version 1
    const dataV1 = generateEncryptedData(1);
    await app.fetch(new Request('http://localhost/sync/data', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ encryptedData: dataV1, version: 1 })
    }), { ...env, db });

    // Device B: Login
    const loginRes = await app.fetch(new Request('http://localhost/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ email, passwordHash })
    }), { ...env, db });

    const { token: token2 } = await loginRes.json();

    // Device B: Fetch current data (v1)
    const fetchRes = await app.fetch(new Request('http://localhost/sync/data', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token2}`,
        'Origin': 'https://pib.uob.com.sg'
      }
    }), { ...env, db });

    const fetchData = await fetchRes.json();
    expect(fetchData.version).toBe(1);

    // Device A: Update to version 2
    const dataV2 = generateEncryptedData(2);
    await app.fetch(new Request('http://localhost/sync/data', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ encryptedData: dataV2, version: 2 })
    }), { ...env, db });

    // Device B: Try to update to version 2 (conflict!)
    const dataV2B = generateEncryptedData(2);
    const conflictRes = await app.fetch(new Request('http://localhost/sync/data', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token2}`,
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ encryptedData: dataV2B, version: 2 })
    }), { ...env, db });

    expect(conflictRes.status).toBe(409);
    const conflictData = await conflictRes.json();
    expect(conflictData.error).toBe('Version conflict');
    expect(conflictData.currentVersion).toBe(2);

    // Device B: Fetch latest and update to version 3
    const latestRes = await app.fetch(new Request('http://localhost/sync/data', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token2}`,
        'Origin': 'https://pib.uob.com.sg'
      }
    }), { ...env, db });

    const latestData = await latestRes.json();
    expect(latestData.version).toBe(2);

    // Now update to version 3
    const dataV3 = generateEncryptedData(3);
    const resolveRes = await app.fetch(new Request('http://localhost/sync/data', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token2}`,
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ encryptedData: dataV3, version: 3 })
    }), { ...env, db });

    expect(resolveRes.status).toBe(200);
  });

  test('GDPR data deletion scenario', async () => {
    const email = randomEmail();
    const passwordHash = hashPassword('password123');

    // Setup user with data
    const registerRes = await app.fetch(new Request('http://localhost/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ email, passwordHash })
    }), { ...env, db });

    const { token, userId } = await registerRes.json();

    // Add devices and sync data
    await app.fetch(new Request('http://localhost/auth/device/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({
        deviceName: 'Test Device',
        deviceFingerprint: 'fp-123'
      })
    }), { ...env, db });

    await app.fetch(new Request('http://localhost/sync/data', {
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
    }), { ...env, db });

    // Delete all data
    const deleteRes = await app.fetch(new Request('http://localhost/user/data', {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pib.uob.com.sg'
      }
    }), { ...env, db });

    expect(deleteRes.status).toBe(200);

    // Verify all data is gone
    const blob = await db.getSyncBlob(userId);
    const devices = await db.getDevicesByUser(userId);

    expect(blob).toBeNull();
    expect(devices.length).toBe(0);
  });
});

describe('E2E - Shared Mappings Flow', () => {
  let db;
  let env;

  beforeEach(() => {
    db = createTestDb();
    env = createTestEnv();
  });

  afterEach(async () => {
    await cleanupTestDb(db);
  });

  test('contribute → moderate → fetch mappings', async () => {
    const email = randomEmail();
    const passwordHash = hashPassword('password123');

    // User registers and contributes
    const registerRes = await app.fetch(new Request('http://localhost/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({ email, passwordHash })
    }), { ...env, db });

    const { token } = await registerRes.json();

    // Contribute mapping
    const contributeRes = await app.fetch(new Request('http://localhost/shared/mappings/contribute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({
        mappings: [
          {
            merchantNormalized: 'STARBUCKS',
            category: 'Dining',
            cardType: 'ONE',
            confidence: 0.95
          }
        ]
      })
    }), { ...env, db });

    expect(contributeRes.status).toBe(200);

    // Admin reviews pending
    const pendingRes = await app.fetch(new Request('http://localhost/admin/mappings/pending', {
      method: 'GET',
      headers: {
        'X-Admin-Key': env.ADMIN_KEY,
        'Origin': 'https://pib.uob.com.sg'
      }
    }), { ...env, db });

    const pendingData = await pendingRes.json();
    expect(pendingData.pending.length).toBeGreaterThan(0);

    // Admin approves
    const approveRes = await app.fetch(new Request('http://localhost/admin/mappings/approve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': env.ADMIN_KEY,
        'Origin': 'https://pib.uob.com.sg'
      },
      body: JSON.stringify({
        merchantNormalized: 'STARBUCKS',
        category: 'Dining',
        cardType: 'ONE'
      })
    }), { ...env, db });

    expect(approveRes.status).toBe(200);

    // User fetches approved mappings
    const fetchRes = await app.fetch(new Request('http://localhost/shared/mappings/ONE', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pib.uob.com.sg'
      }
    }), { ...env, db });

    const fetchData = await fetchRes.json();
    expect(fetchData.mappings.length).toBeGreaterThan(0);
    const mapping = fetchData.mappings.find(m => m.merchant_normalized === 'STARBUCKS');
    expect(mapping).toBeDefined();
  });
});
