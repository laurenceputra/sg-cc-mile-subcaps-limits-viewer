import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import app from '../../index.js';
import {
  TEST_ADMIN_EMAIL,
  TEST_ADMIN_PASSWORD,
  createTestDatabase,
  createTestEnv,
  disposeTestDatabase,
  expectJwtLike,
  expectStatus,
  fetchJson
} from './test-utils.js';

function randomEmail(prefix = 'contract') {
  return `${prefix}-${crypto.randomBytes(6).toString('hex')}@example.com`;
}

function createEncryptedData() {
  return {
    iv: crypto.randomBytes(16).toString('base64'),
    ciphertext: crypto.randomBytes(32).toString('base64'),
    salt: crypto.randomBytes(16).toString('base64'),
    tag: crypto.randomBytes(8).toString('base64')
  };
}

function extractCookieValue(setCookieHeader, name) {
  if (!setCookieHeader) return null;
  const match = setCookieHeader.match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : null;
}

function assertRefreshCookie(setCookieHeader, context) {
  assert.ok(setCookieHeader, `${context}: Set-Cookie header should be present`);
  assert.ok(setCookieHeader.includes('ccSubcapRefreshToken='), `${context}: refresh cookie name should be present`);
  assert.ok(setCookieHeader.includes('Max-Age=2592000'), `${context}: refresh cookie should use 30 day max age`);
  assert.ok(setCookieHeader.includes('Path=/auth'), `${context}: refresh cookie should be scoped to /auth`);
  assert.ok(setCookieHeader.includes('HttpOnly'), `${context}: refresh cookie should be HttpOnly`);
  assert.ok(setCookieHeader.includes('SameSite=Strict'), `${context}: refresh cookie should be strict same-site`);
}

async function registerUser(env, email, passwordHash, origin = 'https://pib.uob.com.sg') {
  return fetchJson(app, env, '/auth/register', {
    method: 'POST',
    origin,
    body: { email, passwordHash }
  }, 200, 'register user');
}

async function loginUser(env, email, passwordHash, origin = 'https://pib.uob.com.sg') {
  return fetchJson(app, env, '/auth/login', {
    method: 'POST',
    origin,
    body: { email, passwordHash }
  }, 200, 'login user');
}

async function loginAdmin(env) {
  return fetchJson(app, env, '/admin/auth/login', {
    method: 'POST',
    body: { email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD }
  }, 200, 'admin login');
}

describe('Workers userscript API contract', () => {
  test('verifies auth register/login/refresh contract', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv(), db };
      const email = randomEmail();
      const passwordHash = crypto.randomBytes(32).toString('hex');

      const { response: registerRes, json: registerJson } = await registerUser(env, email, passwordHash);
      assert.equal(registerRes.headers.get('Set-Cookie'), null, 'register should not set refresh cookie');
      expectJwtLike(registerJson.token, 'register token');
      assert.equal(typeof registerJson.userId, 'number', 'register userId should be numeric');
      assert.equal(registerJson.tier, 'free');

      const { response: loginRes, json: loginJson } = await loginUser(env, email, passwordHash);
      expectJwtLike(loginJson.token, 'login token');
      assert.equal(typeof loginJson.userId, 'number', 'login userId should be numeric');
      assert.equal(loginJson.tier, 'free');
      const loginCookie = loginRes.headers.get('Set-Cookie');
      assertRefreshCookie(loginCookie, 'login');
      const refreshToken = extractCookieValue(loginCookie, 'ccSubcapRefreshToken');
      assert.ok(refreshToken, 'login should return refresh token cookie value');

      const missingCookieRefreshRes = await app.fetch(new Request('http://localhost/auth/refresh', {
        method: 'POST',
        headers: {
          'Origin': 'https://pib.uob.com.sg'
        }
      }), env);
      const missingCookieRefreshJson = await missingCookieRefreshRes.json();
      expectStatus(missingCookieRefreshRes, 401, 'refresh without cookie');
      assert.equal(missingCookieRefreshJson.error, 'Unauthorized');

      const refreshRes = await app.fetch(new Request('http://localhost/auth/refresh', {
        method: 'POST',
        headers: {
          'Origin': 'https://pib.uob.com.sg',
          'Cookie': `ccSubcapRefreshToken=${refreshToken}`
        }
      }), env);
      const refreshJson = await refreshRes.json();
      expectStatus(refreshRes, 200, 'refresh with cookie');
      expectJwtLike(refreshJson.token, 'refreshed access token');
      const rotatedCookie = refreshRes.headers.get('Set-Cookie');
      assertRefreshCookie(rotatedCookie, 'refresh');
      const rotatedToken = extractCookieValue(rotatedCookie, 'ccSubcapRefreshToken');
      assert.ok(rotatedToken, 'refresh should rotate refresh token');
      assert.notEqual(rotatedToken, refreshToken, 'refresh should rotate cookie value');
    } finally {
      await disposeTestDatabase(mf);
    }
  });

  test('verifies cap policy contract', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv(), db };
      const res = await app.fetch(new Request('http://localhost/meta/cap-policy'), env);
      const json = await res.json();

      expectStatus(res, 200, 'cap policy');
      assert.equal(typeof json.version, 'number');
      assert.equal(typeof json.thresholds.warningRatio, 'number');
      assert.equal(typeof json.thresholds.criticalRatio, 'number');
      assert.equal(typeof json.styles.warning.background, 'string');
      assert.equal(json.cards["LADY'S SOLITAIRE CARD"].mode, 'per-category');
      assert.equal(json.cards['XL Rewards Card'].mode, 'combined');
    } finally {
      await disposeTestDatabase(mf);
    }
  });

  test('verifies sync data contract and conflict handling', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv(), db };
      const email = randomEmail('sync');
      const passwordHash = crypto.randomBytes(32).toString('hex');
      await registerUser(env, email, passwordHash);
      const { json: loginJson } = await loginUser(env, email, passwordHash);
      const token = loginJson.token;

      const initialGetRes = await app.fetch(new Request('http://localhost/sync/data', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Origin': 'https://pib.uob.com.sg'
        }
      }), env);
      const initialGetJson = await initialGetRes.json();
      expectStatus(initialGetRes, 200, 'initial sync read');
      assert.equal(initialGetJson.encryptedData, null);
      assert.equal(initialGetJson.version, 0);

      const { json: missingSaltJson } = await fetchJson(app, env, '/sync/data', {
        method: 'PUT',
        token,
        body: {
          encryptedData: {
            iv: crypto.randomBytes(16).toString('base64'),
            ciphertext: crypto.randomBytes(32).toString('base64')
          },
          version: 1
        }
      }, 400, 'sync write without salt');
      assert.match(missingSaltJson.error, /salt/i);

      const encryptedData = createEncryptedData();
      const putRes = await app.fetch(new Request('http://localhost/sync/data', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Origin': 'https://pib.uob.com.sg'
        },
        body: JSON.stringify({ encryptedData, version: 1 })
      }), env);
      const putJson = await putRes.json();
      expectStatus(putRes, 200, 'sync write');
      assert.equal(putJson.success, true);
      assert.equal(putJson.version, 1);

      const secondGetRes = await app.fetch(new Request('http://localhost/sync/data', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Origin': 'https://pib.uob.com.sg'
        }
      }), env);
      const secondGetJson = await secondGetRes.json();
      expectStatus(secondGetRes, 200, 'sync read after write');
      assert.deepEqual(secondGetJson.encryptedData, encryptedData);
      assert.equal(secondGetJson.version, 1);
      assert.equal(typeof secondGetJson.updatedAt, 'number');

      const stalePutRes = await app.fetch(new Request('http://localhost/sync/data', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Origin': 'https://pib.uob.com.sg'
        },
        body: JSON.stringify({ encryptedData, version: 1 })
      }), env);
      const stalePutJson = await stalePutRes.json();
      expectStatus(stalePutRes, 409, 'stale sync write');
      assert.equal(stalePutJson.error, 'Version conflict');
      assert.equal(stalePutJson.currentVersion, 1);
    } finally {
      await disposeTestDatabase(mf);
    }
  });

  test('verifies shared mappings contract with canonical response fields and legacy request alias', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv(), db };
      const email = randomEmail('mappings');
      const passwordHash = crypto.randomBytes(32).toString('hex');
      await registerUser(env, email, passwordHash);
      const { json: loginJson } = await loginUser(env, email, passwordHash);
      const token = loginJson.token;

      const { json: contributeJson } = await fetchJson(app, env, '/shared/mappings/contribute', {
        method: 'POST',
        token,
        body: {
          mappings: [
            {
              merchantRaw: 'Coffee Bean',
              category: 'dining',
              cardType: 'one'
            }
          ]
        }
      }, 200, 'shared mapping contribution');
      assert.equal(contributeJson.success, true);
      assert.equal(contributeJson.contributed, 1);

      const { json: invalidContributionJson } = await fetchJson(app, env, '/shared/mappings/contribute', {
        method: 'POST',
        token,
        body: {
          mappings: [
            {
              merchantRaw: 'Coffee Bean',
              cardType: 'ONE'
            }
          ]
        }
      }, 400, 'shared mapping contribution without category');
      assert.match(invalidContributionJson.error, /suggestedCategory/i);

      const { json: invalidCardContributionJson } = await fetchJson(app, env, '/shared/mappings/contribute', {
        method: 'POST',
        token,
        body: {
          mappings: [
            {
              merchantRaw: 'Coffee Bean',
              suggestedCategory: 'dining',
              cardType: 'foo'
            }
          ]
        }
      }, 400, 'shared mapping contribution with invalid card type');
      assert.match(invalidCardContributionJson.error, /invalid card type/i);

      const { json: adminLoginJson } = await loginAdmin(env);
      expectJwtLike(adminLoginJson.token, 'admin token');
      const approveRes = await app.fetch(new Request('http://localhost/admin/mappings/approve', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminLoginJson.token}`,
          'Content-Type': 'application/json',
          'Origin': 'https://pib.uob.com.sg'
        },
        body: JSON.stringify({
          merchantNormalized: 'coffee bean',
          category: 'dining',
          cardType: 'one'
        })
      }), env);
      const approveJson = await approveRes.json();
      expectStatus(approveRes, 200, 'approve shared mapping');
      assert.equal(approveJson.success, true);

      const getRes = await app.fetch(new Request('http://localhost/shared/mappings/one', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Origin': 'https://pib.uob.com.sg'
        }
      }), env);
      const getJson = await getRes.json();
      expectStatus(getRes, 200, 'shared mapping read');
      assert.ok(Array.isArray(getJson.mappings));
      assert.equal(getJson.mappings.length, 1);
      assert.deepEqual(getJson.mappings[0], {
        merchant: 'coffee bean',
        merchantNormalized: 'coffee bean',
        suggestedCategory: 'dining',
        category: 'dining',
        cardType: 'ONE',
        contributionCount: 1,
        lastUpdated: getJson.mappings[0].lastUpdated
      });
      assert.equal(typeof getJson.mappings[0].lastUpdated, 'number');

      const invalidCardTypeRes = await app.fetch(new Request('http://localhost/shared/mappings/not-a-card', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Origin': 'https://pib.uob.com.sg'
        }
      }), env);
      const invalidCardTypeJson = await invalidCardTypeRes.json();
      expectStatus(invalidCardTypeRes, 400, 'invalid shared mapping card type');
      assert.equal(invalidCardTypeJson.error, 'Invalid card type');
    } finally {
      await disposeTestDatabase(mf);
    }
  });
});
