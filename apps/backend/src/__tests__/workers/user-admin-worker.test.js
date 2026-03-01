import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import app from '../../index.js';
import { createTestDatabase, createTestEnv, disposeTestDatabase, TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD } from './test-utils.js';

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
      const env = { ...createTestEnv(), db };
      const { token } = await registerAndLogin(env);
      const encryptedData = createEncryptedData();

      const syncRes = await app.fetch(new Request('http://localhost/sync/data', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Origin': 'https://pib.uob.com.sg'
        },
        body: JSON.stringify({ encryptedData, version: 1 })
      }), env);
      assert.equal(syncRes.status, 200);

      const deviceRes = await app.fetch(new Request('http://localhost/auth/device/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Origin': 'https://pib.uob.com.sg'
        },
        body: JSON.stringify({ deviceId: 'device-123', name: 'Test Device' })
      }), env);
      assert.equal(deviceRes.status, 200);

      const exportRes = await app.fetch(new Request('http://localhost/user/export', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Origin': 'https://pib.uob.com.sg'
        }
      }), env);

      assert.equal(exportRes.status, 200);
      const exportPayload = await exportRes.json();

      assert.deepEqual(exportPayload.syncData, encryptedData);
      assert.strictEqual(Array.isArray(exportPayload.devices), true, 'devices should be an array');
      assert.strictEqual(exportPayload.devices.length, 1, 'should contain exactly the one registered device');
      assert.strictEqual(typeof exportPayload.exportedAt, 'number', 'exportedAt should be a Unix timestamp');
    } finally {
      await disposeTestDatabase(mf);
    }
  });

  test('pending mappings query returns contributed entry', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv(), db };
      const { token: userToken } = await registerAndLogin(env);
      const contributeRes = await app.fetch(new Request('http://localhost/shared/mappings/contribute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`,
          'Origin': 'https://pib.uob.com.sg'
        },
        body: JSON.stringify({
          mappings: [
            {
              merchantRaw: 'TEST_MERCHANT',
              category: 'Dining',
              cardType: 'ONE',
              confidence: 0.9
            }
          ]
        })
      }), env);
      assert.equal(contributeRes.status, 200);

      const { adminLoginRes, adminData } = await loginAdmin(env);
      assert.equal(adminLoginRes.status, 200);

      const pendingRes = await app.fetch(new Request('http://localhost/admin/mappings/pending', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${adminData.token}`,
          'Origin': 'https://pib.uob.com.sg'
        }
      }), env);
      assert.equal(pendingRes.status, 200);

      const pendingData = await pendingRes.json();
      assert.strictEqual(Array.isArray(pendingData.pending), true, 'pending mappings should be an array');
      const testEntry = pendingData.pending.find((entry) => entry.merchant_raw === 'TEST_MERCHANT');
      assert.notStrictEqual(testEntry, undefined, 'pending mappings should contain the contributed TEST_MERCHANT entry');
      assert.equal(testEntry.category, 'Dining');
      assert.equal(testEntry.card_type, 'ONE');

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
