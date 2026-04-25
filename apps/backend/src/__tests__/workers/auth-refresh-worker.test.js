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

function assertRefreshCookieSecurity(setCookieHeader, label) {
  assert.ok(setCookieHeader, `${label}: Set-Cookie header is present`);
  assert.ok(setCookieHeader.includes('ccSubcapRefreshToken='), `${label}: refresh token cookie is set`);
  assert.ok(setCookieHeader.includes('HttpOnly'), `${label}: cookie is HttpOnly`);
  assert.match(setCookieHeader, /SameSite=Strict/i, `${label}: cookie enforces strict same-site policy`);
}

function decodeJwtPayload(token) {
  const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
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
      assertRefreshCookieSecurity(setCookie, 'login');
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
      assertRefreshCookieSecurity(rotatedCookie, 'refresh');
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

  test('recent rotation replay does not revoke the winning token family', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv(), db };
      const email = randomEmail();
      const passwordHash = crypto.randomBytes(32).toString('hex');

      await registerUser(env, email, passwordHash);
      const { response: loginRes } = await loginUser(env, email, passwordHash);
      const originalRefreshToken = extractCookieValue(loginRes.headers.get('Set-Cookie'), 'ccSubcapRefreshToken');
      assert.ok(originalRefreshToken);

      const originalHash = crypto.createHash('sha256').update(originalRefreshToken).digest('hex');
      const originalRecord = await db.getRefreshTokenByHash(originalHash);
      assert.ok(originalRecord);

      const rotated = await db.markRefreshTokenRotated(originalRecord.id, 'already-claimed');
      assert.equal(rotated, 1);
      const winnerRefreshToken = 'winner-token';
      const childId = await db.createRefreshToken(
        originalRecord.user_id,
        crypto.createHash('sha256').update(winnerRefreshToken).digest('hex'),
        originalRecord.family_id,
        Math.floor(Date.now() / 1000) + 3600,
        originalRecord.id
      );
      assert.ok(childId);

      const raceRes = await app.fetch(new Request('http://localhost/auth/refresh', {
        method: 'POST',
        headers: {
          'Origin': 'https://pib.uob.com.sg',
          'Cookie': `ccSubcapRefreshToken=${originalRefreshToken}`
        }
      }), env);
      assert.equal(raceRes.status, 401);

      const familyRows = await db.all('SELECT revoked_at FROM refresh_tokens WHERE family_id = ?', originalRecord.family_id);
      assert.equal(familyRows.every((row) => row.revoked_at === null), true);

      const winnerRes = await app.fetch(new Request('http://localhost/auth/refresh', {
        method: 'POST',
        headers: {
          'Origin': 'https://pib.uob.com.sg',
          'Cookie': `ccSubcapRefreshToken=${winnerRefreshToken}`
        }
      }), env);
      assert.equal(winnerRes.status, 200);
    } finally {
      await disposeTestDatabase(mf);
    }
  });

  test('older rotated token reuse revokes the token family', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv(), db };
      const email = randomEmail();
      const passwordHash = crypto.randomBytes(32).toString('hex');

      await registerUser(env, email, passwordHash);
      const { response: loginRes } = await loginUser(env, email, passwordHash);
      const originalRefreshToken = extractCookieValue(loginRes.headers.get('Set-Cookie'), 'ccSubcapRefreshToken');
      const originalHash = crypto.createHash('sha256').update(originalRefreshToken).digest('hex');
      const originalRecord = await db.getRefreshTokenByHash(originalHash);
      assert.ok(originalRecord);

      await db.markRefreshTokenRotated(originalRecord.id, 'old-rotation');
      const childRefreshToken = 'child-after-old-rotation';
      await db.createRefreshToken(
        originalRecord.user_id,
        crypto.createHash('sha256').update(childRefreshToken).digest('hex'),
        originalRecord.family_id,
        Math.floor(Date.now() / 1000) + 3600,
        originalRecord.id
      );
      await db.run(
        'UPDATE refresh_tokens SET rotated_at = ? WHERE id = ?',
        Math.floor(Date.now() / 1000) - 60,
        originalRecord.id
      );

      const reuseRes = await app.fetch(new Request('http://localhost/auth/refresh', {
        method: 'POST',
        headers: {
          'Origin': 'https://pib.uob.com.sg',
          'Cookie': `ccSubcapRefreshToken=${originalRefreshToken}`
        }
      }), env);
      assert.equal(reuseRes.status, 401);

      const familyRows = await db.all('SELECT revoked_at FROM refresh_tokens WHERE family_id = ?', originalRecord.family_id);
      assert.equal(familyRows.every((row) => row.revoked_at !== null), true);

      const childRes = await app.fetch(new Request('http://localhost/auth/refresh', {
        method: 'POST',
        headers: {
          'Origin': 'https://pib.uob.com.sg',
          'Cookie': `ccSubcapRefreshToken=${childRefreshToken}`
        }
      }), env);
      assert.equal(childRes.status, 401);
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
      assertRefreshCookieSecurity(refreshCookie, 'pre-logout login');
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

  test('single logout does not revoke another active access token for the same user', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv(), db };
      const email = randomEmail();
      const passwordHash = crypto.randomBytes(32).toString('hex');

      await registerUser(env, email, passwordHash);
      const { response: firstLoginRes, json: firstLoginData } = await loginUser(env, email, passwordHash);
      const { json: secondLoginData } = await loginUser(env, email, passwordHash);
      const firstRefreshToken = extractCookieValue(firstLoginRes.headers.get('Set-Cookie'), 'ccSubcapRefreshToken');

      const logoutRes = await app.fetch(new Request('http://localhost/auth/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firstLoginData.token}`,
          'Origin': 'https://pib.uob.com.sg',
          'Cookie': `ccSubcapRefreshToken=${firstRefreshToken}`
        }
      }), env);
      assert.equal(logoutRes.status, 200);

      const loggedOutTokenRes = await app.fetch(new Request('http://localhost/sync/data', {
        method: 'GET',
        headers: { Authorization: `Bearer ${firstLoginData.token}` }
      }), env);
      assert.equal(loggedOutTokenRes.status, 401);

      const secondTokenRes = await app.fetch(new Request('http://localhost/sync/data', {
        method: 'GET',
        headers: { Authorization: `Bearer ${secondLoginData.token}` }
      }), env);
      assert.equal(secondTokenRes.status, 200);
    } finally {
      await disposeTestDatabase(mf);
    }
  });

  test('logout_all marker revokes previously issued access tokens', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv(), db };
      const email = randomEmail();
      const passwordHash = crypto.randomBytes(32).toString('hex');

      await registerUser(env, email, passwordHash);
      const { json: loginData } = await loginUser(env, email, passwordHash);
      const payload = decodeJwtPayload(loginData.token);
      await db.blacklistToken(payload.userId, 'logout-all-marker', Math.floor(Date.now() / 1000) + 3600, 'logout_all');
      await db.run(
        "UPDATE token_blacklist SET blacklisted_at = ? WHERE token_jti = 'logout-all-marker'",
        payload.iat + 1
      );

      const res = await app.fetch(new Request('http://localhost/sync/data', {
        method: 'GET',
        headers: { Authorization: `Bearer ${loginData.token}` }
      }), env);
      assert.equal(res.status, 401);
    } finally {
      await disposeTestDatabase(mf);
    }
  });
});
