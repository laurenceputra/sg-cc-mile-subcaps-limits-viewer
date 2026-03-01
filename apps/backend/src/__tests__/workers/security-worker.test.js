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

  test('allows trusted userscript header when origin is unavailable in production', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv({ ENVIRONMENT: 'production', NODE_ENV: 'production' }), db };
      const cases = [
        {
          name: 'missing origin',
          headers: {
            'Content-Type': 'application/json',
            'X-CC-Userscript': 'tampermonkey-v1'
          }
        },
        {
          name: 'explicit null origin',
          headers: {
            'Content-Type': 'application/json',
            'X-CC-Userscript': 'tampermonkey-v1',
            'Origin': 'null'
          }
        },
        {
          name: 'non-http(s) origin',
          headers: {
            'Content-Type': 'application/json',
            'X-CC-Userscript': 'tampermonkey-v1',
            'Origin': 'chrome-extension://abcdefghijklmnop'
          }
        }
      ];

      for (const testCase of cases) {
        const email = `secure-${crypto.randomBytes(6).toString('hex')}@example.com`;
        const passwordHash = crypto.randomBytes(32).toString('hex');
        const res = await app.fetch(new Request('http://localhost/auth/register', {
          method: 'POST',
          headers: testCase.headers,
          body: JSON.stringify({ email, passwordHash })
        }), env);

        assert.equal(res.status, 200, `trusted userscript should allow ${testCase.name}`);
        const data = await res.json();
        assert.strictEqual(typeof data.token, 'string', `${testCase.name}: token should be a string`);
        assert.match(data.token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, `${testCase.name}: token should be valid JWT format`);
      }
    } finally {
      await disposeTestDatabase(mf);
    }
  });

  test('rejects disallowed valid web origin in production', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv({ ENVIRONMENT: 'production', NODE_ENV: 'production' }), db };
      const email = `secure-bad-origin-${crypto.randomBytes(6).toString('hex')}@example.com`;
      const passwordHash = crypto.randomBytes(32).toString('hex');

      const res = await app.fetch(new Request('http://localhost/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CC-Userscript': 'tampermonkey-v1',
          'Origin': 'https://evil.example'
        },
        body: JSON.stringify({ email, passwordHash })
      }), env);

      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.message, 'CSRF validation failed: Invalid origin');
    } finally {
      await disposeTestDatabase(mf);
    }
  });
});
