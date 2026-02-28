import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import app from '../../index.js';
import { createTestDatabase, createTestEnv, disposeTestDatabase } from './test-utils.js';
import { fetchSyncSnapshot } from '../../api/sync.js';

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
      assert.strictEqual(typeof token, 'string', 'login should return a JWT token');
    } finally {
      await disposeTestDatabase(mf);
    }
  });

  test('sync snapshot reflects stored payload', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const userId = await db.createUser(randomEmail(), crypto.randomBytes(32).toString('hex'), 'free');
      const encryptedData = createEncryptedData();
      await db.upsertSyncBlobAtomic(userId, 1, encryptedData);

      const snapshot = await fetchSyncSnapshot(db, userId);
      assert.equal(snapshot.version, 1);
      assert.deepEqual(snapshot.encryptedData, encryptedData);
      assert.strictEqual(typeof snapshot.updatedAt, 'number', 'updatedAt should be a Unix timestamp');
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

  test('allows trusted userscript when origin is null', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv(), ENVIRONMENT: 'production', db };
      const email = randomEmail();
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
          'Origin': 'null',
          'X-CC-Userscript': 'tampermonkey-v1'
        },
        body: JSON.stringify({ email, passwordHash })
      }), env);

      assert.equal(loginRes.status, 200);
      const loginData = await loginRes.json();
      assert.strictEqual(typeof loginData.token, 'string', 'trusted userscript login should return a token');
    } finally {
      await disposeTestDatabase(mf);
    }
  });

  test('allows trusted userscript when origin is non-http', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv(), ENVIRONMENT: 'production', db };
      const email = randomEmail();
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
          'Origin': 'chrome-extension://abc123',
          'X-CC-Userscript': 'tampermonkey-v1'
        },
        body: JSON.stringify({ email, passwordHash })
      }), env);

      assert.equal(loginRes.status, 200);
      const loginData = await loginRes.json();
      assert.strictEqual(typeof loginData.token, 'string', 'trusted userscript login should return a token');
    } finally {
      await disposeTestDatabase(mf);
    }
  });

  test('rejects non-authoritative origin without trusted userscript header', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv(), ENVIRONMENT: 'production', db };
      const email = randomEmail();
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
          'Origin': 'null'
        },
        body: JSON.stringify({ email, passwordHash })
      }), env);

      assert.equal(loginRes.status, 403);
    } finally {
      await disposeTestDatabase(mf);
    }
  });

});
