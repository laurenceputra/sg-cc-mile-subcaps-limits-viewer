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
  const res = await app.fetch(new Request('http://localhost/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://pib.uob.com.sg'
    },
    body: JSON.stringify({ email, passwordHash })
  }), env);
  assert.equal(res.status, 200, 'registration should succeed');
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
    assert.match(cookie, /ccSubcapRefreshToken=token/, 'cookie should contain refresh token value');
    assert.match(cookie, /HttpOnly/, 'cookie should include HttpOnly flag');
    assert.match(cookie, /SameSite=Strict/, 'cookie should enforce SameSite=Strict');
    assert.match(cookie, /Secure/, 'cookie should include Secure flag');

    const cleared = clearRefreshCookie({ ENVIRONMENT: 'production', NODE_ENV: 'production' });
    assert.match(cleared, /Max-Age=0/, 'cleared cookie should expire immediately');
    assert.match(cleared, /HttpOnly/, 'cleared cookie should retain HttpOnly flag');
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
      assert.strictEqual(typeof setCookie, 'string', 'login should set a cookie');
      assert.match(setCookie, /ccSubcapRefreshToken=/, 'cookie should contain refresh token');
      assert.match(setCookie, /HttpOnly/, 'cookie should include HttpOnly flag');
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
      assert.strictEqual(typeof originalRefreshToken, 'string', 'login should return a refresh token');

      const refreshRes = await app.fetch(new Request('http://localhost/auth/refresh', {
        method: 'POST',
        headers: {
          'Origin': 'https://pib.uob.com.sg',
          'Cookie': `ccSubcapRefreshToken=${originalRefreshToken}`
        }
      }), env);
      assert.equal(refreshRes.status, 200);
      const refreshData = await refreshRes.json();
      assert.strictEqual(typeof refreshData.token, 'string', 'refresh should return an access token');
      const rotatedCookie = refreshRes.headers.get('Set-Cookie');
      const rotatedRefreshToken = extractCookieValue(rotatedCookie, 'ccSubcapRefreshToken');
      assert.strictEqual(typeof rotatedRefreshToken, 'string', 'refresh should issue a rotated token');
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
      assert.strictEqual(typeof refreshToken, 'string', 'login should return a refresh token');

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
      assert.match(setCookie, /ccSubcapRefreshToken=/, 'logout should clear refresh token cookie');
      assert.match(setCookie, /Max-Age=0/, 'logout cookie should expire immediately');
      assert.match(setCookie, /HttpOnly/, 'logout cookie should retain HttpOnly flag');
      assert.match(setCookie, /SameSite=Strict/, 'logout cookie should retain SameSite=Strict');
    } finally {
      await disposeTestDatabase(mf);
    }
  });

});
