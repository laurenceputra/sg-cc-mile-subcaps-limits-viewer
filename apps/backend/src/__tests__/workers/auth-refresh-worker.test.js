import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import app from '../../index.js';
import {
  createTestDatabase,
  createTestEnv,
  disposeTestDatabase,
  expectJwtLike,
  expectStatus,
  fetchJson
} from './test-utils.js';

function randomEmail() {
  return `refresh-${crypto.randomBytes(6).toString('hex')}@example.com`;
}

function extractCookieValue(setCookieHeader, name) {
  if (!setCookieHeader) return null;
  const match = setCookieHeader.match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : null;
}

async function registerUser(env, email, passwordHash) {
  return fetchJson(app, env, '/auth/register', {
    method: 'POST',
    body: { email, passwordHash }
  }, 200, 'register user');
}

async function loginUser(env, email, passwordHash) {
  return fetchJson(app, env, '/auth/login', {
    method: 'POST',
    body: { email, passwordHash }
  }, 200, 'login user');
}

describe('Workers auth refresh flow', () => {
  test('login sets refresh cookie', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv(), db };
      const email = randomEmail();
      const passwordHash = crypto.randomBytes(32).toString('hex');

      await registerUser(env, email, passwordHash);
      const { response: loginRes, json: loginData } = await loginUser(env, email, passwordHash);
      expectJwtLike(loginData.token, 'login token');
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
      const { response: loginRes, json: loginData } = await loginUser(env, email, passwordHash);
      expectJwtLike(loginData.token, 'login token');
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
      const refreshData = await refreshRes.json();
      expectStatus(refreshRes, 200, 'refresh token exchange');
      expectJwtLike(refreshData.token, 'refreshed access token');
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
      const { response: loginRes, json: loginData } = await loginUser(env, email, passwordHash);
      expectJwtLike(loginData.token, 'login token');
      const refreshCookie = loginRes.headers.get('Set-Cookie');
      const refreshToken = extractCookieValue(refreshCookie, 'ccSubcapRefreshToken');

      const logoutRes = await app.fetch(new Request('http://localhost/auth/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${loginData.token}`,
          'Origin': 'https://pib.uob.com.sg',
          'Cookie': `ccSubcapRefreshToken=${refreshToken}`
        }
      }), env);
      assert.equal(logoutRes.status, 200);
      const logoutCookie = logoutRes.headers.get('Set-Cookie');
      assert.ok(logoutCookie);
      assert.ok(logoutCookie.includes('Max-Age=0'));
    } finally {
      await disposeTestDatabase(mf);
    }
  });
});
