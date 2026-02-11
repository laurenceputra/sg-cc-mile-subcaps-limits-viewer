import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import app from '../../index.js';
import { createTestDatabase, createTestEnv, disposeTestDatabase } from './test-utils.js';

describe('Workers security basics', () => {
  test('rejects state-changing request without origin in production', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv({ ENVIRONMENT: 'production', NODE_ENV: 'production' }), db };
      const email = `secure-${crypto.randomBytes(6).toString('hex')}@example.com`;
      const passwordHash = crypto.randomBytes(32).toString('hex');

      const res = await app.fetch(new Request('http://localhost/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, passwordHash })
      }), env);

      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.error, 'Forbidden');
    } finally {
      await disposeTestDatabase(mf);
    }
  });
});
