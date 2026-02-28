import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import app from '../../index.js';
import { createTestDatabase, createTestEnv, disposeTestDatabase, TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD } from './test-utils.js';
import { fetchPendingMappings } from '../../api/admin.js';
import { fetchUserExport } from '../../api/user.js';

function createEncryptedData() {
  return {
    iv: crypto.randomBytes(16).toString('base64'),
    ciphertext: crypto.randomBytes(32).toString('base64'),
    tag: crypto.randomBytes(8).toString('base64')
  };
}

async function registerAndLogin(env) {
  const email = `user-${crypto.randomBytes(6).toString('hex')}@example.com`;
  const passwordHash = crypto.randomBytes(32).toString('hex');

  const registerRes = await app.fetch(new Request('http://localhost/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://pib.uob.com.sg'
    },
    body: JSON.stringify({ email, passwordHash })
  }), env);
  assert.equal(registerRes.status, 200);

  const loginRes = await app.fetch(new Request('http://localhost/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://pib.uob.com.sg'
    },
    body: JSON.stringify({ email, passwordHash })
  }), env);

  assert.equal(loginRes.status, 200);
  const loginData = await loginRes.json();
  return { token: loginData.token };
}

async function loginAdmin(env, password = TEST_ADMIN_PASSWORD) {
  const adminLoginRes = await app.fetch(new Request('http://localhost/admin/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://pib.uob.com.sg'
    },
    body: JSON.stringify({ email: TEST_ADMIN_EMAIL, password })
  }), env);

  const adminData = await adminLoginRes.json();
  return { adminLoginRes, adminData };
}

describe('Workers user + admin flow', () => {
  test('exports user data and lists devices', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const userId = await db.createUser(`user-${crypto.randomBytes(6).toString('hex')}@example.com`, crypto.randomBytes(32).toString('hex'), 'free');
      const encryptedData = createEncryptedData();
      await db.upsertSyncBlobAtomic(userId, 1, encryptedData);
      await db.registerDevice(userId, 'device-123', 'Test Device');

      const exportPayload = await fetchUserExport(db, userId);
      assert.deepEqual(exportPayload.syncData, encryptedData);
      assert.strictEqual(Array.isArray(exportPayload.devices), true, 'devices should be an array');
      assert.strictEqual(exportPayload.devices.length, 1, 'should contain exactly the one registered device');
    } finally {
      await disposeTestDatabase(mf);
    }
  });

  test('pending mappings query returns contributed entry', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const userId = await db.createUser(`user-${crypto.randomBytes(6).toString('hex')}@example.com`, crypto.randomBytes(32).toString('hex'), 'free');
      await db.contributeMappings(userId, [
        {
          merchantNormalized: 'TEST_MERCHANT',
          category: 'Dining',
          cardType: 'ONE',
          confidence: 0.9
        }
      ]);

      const pending = await fetchPendingMappings(db);
      assert.strictEqual(Array.isArray(pending), true, 'pending mappings should be an array');
      const testEntry = pending.find(entry => entry.merchant_raw === 'TEST_MERCHANT');
      assert.notStrictEqual(testEntry, undefined, 'pending mappings should contain the contributed TEST_MERCHANT entry');
    } finally {
      await disposeTestDatabase(mf);
    }
  });

  test('admin login rejects invalid password', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv(), db };
      const { adminLoginRes } = await loginAdmin(env, 'wrong-password');
      assert.equal(adminLoginRes.status, 401);
    } finally {
      await disposeTestDatabase(mf);
    }
  });

  test('admin endpoints enforce authorization', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv(), db };
      const { token: userToken } = await registerAndLogin(env);
      const { adminLoginRes, adminData } = await loginAdmin(env);
      assert.equal(adminLoginRes.status, 200);

      const logoutRes = await app.fetch(new Request('http://localhost/admin/auth/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminData.token}`,
          'Origin': 'https://pib.uob.com.sg'
        }
      }), env);
      assert.equal(logoutRes.status, 200);

      const cases = [
        {
          name: 'missing token',
          headers: {
            'Origin': 'https://pib.uob.com.sg'
          },
          expectedStatus: 401
        },
        {
          name: 'non-admin token',
          headers: {
            'Authorization': `Bearer ${userToken}`,
            'Origin': 'https://pib.uob.com.sg'
          },
          expectedStatus: 403
        },
        {
          name: 'revoked admin token',
          headers: {
            'Authorization': `Bearer ${adminData.token}`,
            'Origin': 'https://pib.uob.com.sg'
          },
          expectedStatus: 401
        }
      ];

      for (const testCase of cases) {
        const res = await app.fetch(new Request('http://localhost/admin/mappings/pending', {
          method: 'GET',
          headers: testCase.headers
        }), env);
        assert.equal(res.status, testCase.expectedStatus, `admin access should block ${testCase.name}`);
      }
    } finally {
      await disposeTestDatabase(mf);
    }
  });
});
