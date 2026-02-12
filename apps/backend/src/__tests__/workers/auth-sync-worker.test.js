import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import app from '../../index.js';
import { createTestDatabase, createTestEnv, disposeTestDatabase } from './test-utils.js';

function randomEmail() {
  return `test-${crypto.randomBytes(6).toString('hex')}@example.com`;
}

function createEncryptedData() {
  return {
    iv: crypto.randomBytes(16).toString('base64'),
    ciphertext: crypto.randomBytes(32).toString('base64'),
    tag: crypto.randomBytes(8).toString('base64')
  };
}

async function registerAndLogin(env, origin = 'https://pib.uob.com.sg') {
  const email = randomEmail();
  const passwordHash = crypto.randomBytes(32).toString('hex');

  const registerRes = await app.fetch(new Request('http://localhost/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': origin
    },
    body: JSON.stringify({ email, passwordHash })
  }), env);

  assert.equal(registerRes.status, 200);

  const loginRes = await app.fetch(new Request('http://localhost/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': origin
    },
    body: JSON.stringify({ email, passwordHash })
  }), env);

  assert.equal(loginRes.status, 200);
  const loginData = await loginRes.json();

  return { email, passwordHash, token: loginData.token };
}

describe('Workers auth + sync flow', () => {
  test('registers and logs in a user', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv(), db };
      const { token } = await registerAndLogin(env);
      assert.ok(token);
    } finally {
      await disposeTestDatabase(mf);
    }
  });

  test('syncs encrypted data', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv(), db };
      const { token } = await registerAndLogin(env);
      const encryptedData = createEncryptedData();

      const firstGet = await app.fetch(new Request('http://localhost/sync/data', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Origin': 'https://pib.uob.com.sg'
        }
      }), env);

      const firstData = await firstGet.json();
      assert.equal(firstGet.status, 200);
      assert.equal(firstData.version, 0);

      const putRes = await app.fetch(new Request('http://localhost/sync/data', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Origin': 'https://pib.uob.com.sg'
        },
        body: JSON.stringify({ encryptedData, version: 1 })
      }), env);

      assert.equal(putRes.status, 200);

      const secondGet = await app.fetch(new Request('http://localhost/sync/data', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Origin': 'https://pib.uob.com.sg'
        }
      }), env);

      const secondData = await secondGet.json();
      assert.equal(secondGet.status, 200);
      assert.equal(secondData.version, 1);
      assert.deepEqual(secondData.encryptedData, encryptedData);
    } finally {
      await disposeTestDatabase(mf);
    }
  });

  test('accepts maybank origin for auth and sync', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv(), db };
      const maybankOrigin = 'https://cib.maybank2u.com.sg';
      const { token } = await registerAndLogin(env, maybankOrigin);
      const encryptedData = createEncryptedData();

      const putRes = await app.fetch(new Request('http://localhost/sync/data', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Origin': maybankOrigin
        },
        body: JSON.stringify({ encryptedData, version: 1 })
      }), env);

      assert.equal(putRes.status, 200);
    } finally {
      await disposeTestDatabase(mf);
    }
  });
});
