import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import app from '../../index.js';
import { createTestDatabase, createTestEnv, disposeTestDatabase } from './test-utils.js';
import { clearRefreshCookie, buildRefreshCookie } from '../../api/auth.js';

function randomEmail() {
  return `refresh-${crypto.randomBytes(6).toString('hex')}@example.com`;
}

function extractCookieValue(setCookieHeader, name) {
  if (!setCookieHeader) return null;
  const match = setCookieHeader.match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : null;
}

async function registerUser(env, email, passwordHash) {
  await app.fetch(new Request('http://localhost/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://pib.uob.com.sg'
    },
    body: JSON.stringify({ email, passwordHash })
  }), env);
}

async function loginUser(env, email, passwordHash) {
  const loginRes = await app.fetch(new Request('http://localhost/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://pib.uob.com.sg'
    },
    body: JSON.stringify({ email, passwordHash })
  }), env);
  const loginData = await loginRes.json();
  return { loginRes, loginData };
}

describe('Workers auth refresh flow', () => {
  test('refresh cookie helpers apply expected flags', () => {
    const cookie = buildRefreshCookie('token', { ENVIRONMENT: 'production', NODE_ENV: 'production' });
    assert.ok(cookie.includes('ccSubcapRefreshToken=token'));
    assert.ok(cookie.includes('HttpOnly'));
    assert.ok(cookie.includes('SameSite=Strict'));
    assert.ok(cookie.includes('Secure'));

    const cleared = clearRefreshCookie({ ENVIRONMENT: 'production', NODE_ENV: 'production' });
    assert.ok(cleared.includes('Max-Age=0'));
    assert.ok(cleared.includes('HttpOnly'));
  });
  test('login sets refresh cookie', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv(), db };
      const email = randomEmail();
      const passwordHash = crypto.randomBytes(32).toString('hex');

      await registerUser(env, email, passwordHash);
      const { loginRes } = await loginUser(env, email, passwordHash);
      const setCookie = loginRes.headers.get('Set-Cookie');
      assert.ok(setCookie);
      assert.ok(setCookie.includes('ccSubcapRefreshToken='));
      assert.ok(setCookie.includes('HttpOnly'));
    } finally {
      await disposeTestDatabase(mf);
    }
  });

  test('refresh rotates tokens and blocks reuse', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv(), db };
      const email = randomEmail();
      const passwordHash = crypto.randomBytes(32).toString('hex');

      await registerUser(env, email, passwordHash);
      const { loginRes } = await loginUser(env, email, passwordHash);
      const originalCookie = loginRes.headers.get('Set-Cookie');
      const originalRefreshToken = extractCookieValue(originalCookie, 'ccSubcapRefreshToken');
      assert.ok(originalRefreshToken);

      const refreshRes = await app.fetch(new Request('http://localhost/auth/refresh', {
        method: 'POST',
        headers: {
          'Origin': 'https://pib.uob.com.sg',
          'Cookie': `ccSubcapRefreshToken=${originalRefreshToken}`
        }
      }), env);
      assert.equal(refreshRes.status, 200);
      const refreshData = await refreshRes.json();
      assert.ok(refreshData.token);
      const rotatedCookie = refreshRes.headers.get('Set-Cookie');
      const rotatedRefreshToken = extractCookieValue(rotatedCookie, 'ccSubcapRefreshToken');
      assert.ok(rotatedRefreshToken);
      assert.notEqual(rotatedRefreshToken, originalRefreshToken);

      const reuseRes = await app.fetch(new Request('http://localhost/auth/refresh', {
        method: 'POST',
        headers: {
          'Origin': 'https://pib.uob.com.sg',
          'Cookie': `ccSubcapRefreshToken=${originalRefreshToken}`
        }
      }), env);
      assert.equal(reuseRes.status, 401);
    } finally {
      await disposeTestDatabase(mf);
    }
  });

  test('logout clears refresh cookie', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv(), db };
      const email = randomEmail();
      const passwordHash = crypto.randomBytes(32).toString('hex');

      await registerUser(env, email, passwordHash);
      const { loginRes, loginData } = await loginUser(env, email, passwordHash);
      const loginCookie = loginRes.headers.get('Set-Cookie');
      const refreshToken = extractCookieValue(loginCookie, 'ccSubcapRefreshToken');
      assert.ok(refreshToken);

      const logoutRes = await app.fetch(new Request('http://localhost/auth/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${loginData.token}`,
          'Origin': 'https://pib.uob.com.sg',
          'Cookie': `ccSubcapRefreshToken=${refreshToken}`
        }
      }), env);

      assert.equal(logoutRes.status, 200);
      const logoutData = await logoutRes.json();
      assert.equal(logoutData.success, true);
      const setCookie = logoutRes.headers.get('Set-Cookie');
      assert.ok(setCookie.includes('ccSubcapRefreshToken='));
      assert.ok(setCookie.includes('Max-Age=0'));
      assert.ok(setCookie.includes('HttpOnly'));
      assert.ok(setCookie.includes('SameSite=Strict'));
    } finally {
      await disposeTestDatabase(mf);
    }
  });

});
