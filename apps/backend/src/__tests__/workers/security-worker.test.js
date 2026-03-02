import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import app from '../../index.js';
import {
  createTestDatabase,
  createTestEnv,
  disposeTestDatabase,
  expectJwtLike,
  fetchJson
} from './test-utils.js';

function randomSecurityEmail(label) {
  return `${label}-${crypto.randomBytes(6).toString('hex')}@example.com`;
}

function createUserscriptHeaders(origin) {
  const headers = { 'X-CC-Userscript': 'tampermonkey-v1' };
  if (origin !== undefined) {
    headers.Origin = origin;
  }
  return headers;
}

async function assertTokenAuthBehavior(env, token, headers = {}) {
  const successRes = await app.fetch(new Request('http://localhost/sync/data', {
    method: 'GET',
    headers: {
      ...headers,
      Authorization: `Bearer ${token}`
    }
  }), env);
  assert.equal(successRes.status, 200);

  const failureRes = await app.fetch(new Request('http://localhost/sync/data', {
    method: 'GET',
    headers: {
      ...headers,
      Authorization: `Bearer ${token}.tampered`
    }
  }), env);
  assert.equal(failureRes.status, 401);
}

describe('Workers security basics', () => {
  test('rejects state-changing request without origin in production', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv({ ENVIRONMENT: 'production', NODE_ENV: 'production' }), db };
      const email = randomSecurityEmail('secure');
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

  test('allows trusted userscript register/login across browser-origin variants in production', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv({ ENVIRONMENT: 'production', NODE_ENV: 'production' }), db };
      const originVariants = [
        { name: 'missing Origin header', origin: undefined },
        { name: 'explicit null Origin', origin: 'null' },
        { name: 'non-http(s) extension origin', origin: 'chrome-extension://abcdefghijklmnop' }
      ];

      for (const variant of originVariants) {
        const email = randomSecurityEmail(`secure-${variant.name.replace(/[^a-z]/gi, '-')}`);
        const passwordHash = crypto.randomBytes(32).toString('hex');
        const userscriptHeaders = createUserscriptHeaders(variant.origin);

        const { json: registerData } = await fetchJson(app, env, '/auth/register', {
          method: 'POST',
          headers: userscriptHeaders,
          body: { email, passwordHash },
          origin: null
        }, 200, `userscript register (${variant.name})`);

        expectJwtLike(registerData.token, `register token (${variant.name})`);
        await assertTokenAuthBehavior(env, registerData.token, userscriptHeaders);

        const { json: loginData } = await fetchJson(app, env, '/auth/login', {
          method: 'POST',
          headers: userscriptHeaders,
          body: { email, passwordHash },
          origin: null
        }, 200, `userscript login (${variant.name})`);

        expectJwtLike(loginData.token, `login token (${variant.name})`);
        await assertTokenAuthBehavior(env, loginData.token, userscriptHeaders);
      }
    } finally {
      await disposeTestDatabase(mf);
    }
  });

  test('rejects disallowed valid web origin in production', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv({ ENVIRONMENT: 'production', NODE_ENV: 'production' }), db };
      const email = randomSecurityEmail('secure-bad-origin');
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
