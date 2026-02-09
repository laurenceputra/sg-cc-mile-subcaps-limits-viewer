import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import app from '../../index.js';
import { createTestDatabase, createTestEnv, disposeTestDatabase } from './test-utils.js';

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

  await app.fetch(new Request('http://localhost/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://pib.uob.com.sg'
    },
    body: JSON.stringify({ email, passwordHash })
  }), env);

  const loginRes = await app.fetch(new Request('http://localhost/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://pib.uob.com.sg'
    },
    body: JSON.stringify({ email, passwordHash })
  }), env);

  const loginData = await loginRes.json();
  return { token: loginData.token };
}

describe('Workers user + admin flow', () => {
  test('exports user data and lists devices', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv(), db };
      const { token } = await registerAndLogin(env);
      const encryptedData = createEncryptedData();

      await app.fetch(new Request('http://localhost/auth/device/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Origin': 'https://pib.uob.com.sg'
        },
        body: JSON.stringify({ deviceName: 'Test Device', deviceFingerprint: 'device-123' })
      }), env);

      await app.fetch(new Request('http://localhost/sync/data', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Origin': 'https://pib.uob.com.sg'
        },
        body: JSON.stringify({ encryptedData, version: 1 })
      }), env);

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

      await app.fetch(new Request('http://localhost/shared/mappings/contribute', {
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
      }), env);

      const adminRes = await app.fetch(new Request('http://localhost/admin/mappings/pending', {
        method: 'GET',
        headers: {
          'X-Admin-Key': env.ADMIN_KEY,
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
});
