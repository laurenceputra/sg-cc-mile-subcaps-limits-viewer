import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import app from '../../index.js';
import { createTestDatabase, createTestEnv, disposeTestDatabase } from './test-utils.js';
import { getAuthoritativeOrigin, isOriginAllowed } from '../../middleware/csrf.js';

describe('Workers security basics', () => {
  test('origin normalization and allowlist behavior', () => {
    const allowedOrigins = ['https://pib.uob.com.sg', 'https://cib.maybank2u.com.sg'];

    assert.equal(getAuthoritativeOrigin('null', null), null);
    assert.equal(getAuthoritativeOrigin('chrome-extension://abcdefghijklmnop', null), null);
    assert.equal(getAuthoritativeOrigin('https://evil.example/path', null), 'https://evil.example');
    assert.equal(getAuthoritativeOrigin('https://pib.uob.com.sg', null), 'https://pib.uob.com.sg');

    assert.equal(isOriginAllowed('https://pib.uob.com.sg', allowedOrigins), true);
    assert.equal(isOriginAllowed('https://evil.example', allowedOrigins), false);
  });
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
        assert.equal(typeof data.token, 'string');
        assert.ok(data.token.length > 0);
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
