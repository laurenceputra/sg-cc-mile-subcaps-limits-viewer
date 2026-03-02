import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import app from '../../index.js';
import {
  createTestDatabase,
  createTestEnv,
  disposeTestDatabase,
  TEST_ADMIN_EMAIL,
  TEST_ADMIN_PASSWORD,
  expectJwtLike,
  fetchJson
} from './test-utils.js';

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

  await fetchJson(app, env, '/auth/register', {
    method: 'POST',
    body: { email, passwordHash }
  }, 200, 'register user');

  const { json: loginData } = await fetchJson(app, env, '/auth/login', {
    method: 'POST',
    body: { email, passwordHash }
  }, 200, 'login user');

  expectJwtLike(loginData.token, 'user token');
  return { token: loginData.token };
}

async function loginAdmin(env, password = TEST_ADMIN_PASSWORD) {
  return fetchJson(app, env, '/admin/auth/login', {
    method: 'POST',
    body: { email: TEST_ADMIN_EMAIL, password }
  }, 200, 'admin login');
}

describe('Workers user + admin flow', () => {
  test('exports user data and lists devices', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv(), db };
      const { token } = await registerAndLogin(env);
      const encryptedData = createEncryptedData();

      await fetchJson(app, env, '/auth/device/register', {
        method: 'POST',
        token,
        body: { deviceName: 'Test Device', deviceFingerprint: 'device-123' }
      }, 200, 'register device');

      await fetchJson(app, env, '/sync/data', {
        method: 'PUT',
        token,
        body: { encryptedData, version: 1 }
      }, 200, 'save sync payload');

      const exportRes = await app.fetch(new Request('http://localhost/user/export', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Origin': 'https://pib.uob.com.sg'
        }
      }), env);

      const exportData = await exportRes.json();
      assert.equal(exportRes.status, 200);
      assert.deepEqual(exportData.syncData, encryptedData);
      assert.ok(Array.isArray(exportData.devices));
      assert.ok(exportData.devices.length >= 1);
    } finally {
      await disposeTestDatabase(mf);
    }
  });

  test('admin can view pending mappings', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv(), db };
      const { token } = await registerAndLogin(env);

      await fetchJson(app, env, '/shared/mappings/contribute', {
        method: 'POST',
        token,
        body: {
          mappings: [
            {
              merchantNormalized: 'TEST_MERCHANT',
              category: 'Dining',
              cardType: 'ONE',
              confidence: 0.9
            }
          ]
        }
      }, 200, 'contribute mapping');

      const { json: adminLoginData } = await loginAdmin(env);
      expectJwtLike(adminLoginData.token, 'admin token');

      const adminRes = await app.fetch(new Request('http://localhost/admin/mappings/pending', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${adminLoginData.token}`,
          'Origin': 'https://pib.uob.com.sg'
        }
      }), env);

      const adminData = await adminRes.json();
      assert.equal(adminRes.status, 200);
      assert.ok(Array.isArray(adminData.pending));
    } finally {
      await disposeTestDatabase(mf);
    }
  });

  test('admin login rejects invalid password', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv(), db };
      const { response: adminLoginRes } = await fetchJson(app, env, '/admin/auth/login', {
        method: 'POST',
        body: { email: TEST_ADMIN_EMAIL, password: 'wrong-password' }
      }, 401, 'admin login with invalid password');
      assert.equal(adminLoginRes.status, 401);
    } finally {
      await disposeTestDatabase(mf);
    }
  });

  test('admin endpoints require admin role', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv(), db };
      const { token } = await registerAndLogin(env);
      const res = await app.fetch(new Request('http://localhost/admin/mappings/pending', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Origin': 'https://pib.uob.com.sg'
        }
      }), env);
      assert.equal(res.status, 403);
    } finally {
      await disposeTestDatabase(mf);
    }
  });

  test('admin endpoints reject missing token', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv(), db };
      const res = await app.fetch(new Request('http://localhost/admin/mappings/pending', {
        method: 'GET',
        headers: {
          'Origin': 'https://pib.uob.com.sg'
        }
      }), env);
      assert.equal(res.status, 401);
    } finally {
      await disposeTestDatabase(mf);
    }
  });

  test('revoked admin token blocks access', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv(), db };
      const { json: adminData } = await loginAdmin(env);
      expectJwtLike(adminData.token, 'admin token');

      const logoutRes = await app.fetch(new Request('http://localhost/admin/auth/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminData.token}`,
          'Origin': 'https://pib.uob.com.sg'
        }
      }), env);
      assert.equal(logoutRes.status, 200);

      const adminRes = await app.fetch(new Request('http://localhost/admin/mappings/pending', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${adminData.token}`,
          'Origin': 'https://pib.uob.com.sg'
        }
      }), env);
      assert.equal(adminRes.status, 401);
    } finally {
      await disposeTestDatabase(mf);
    }
  });
});
