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

function randomEmail() {
  return `web-${crypto.randomBytes(6).toString('hex')}@example.com`;
}

async function registerAndLogin(env) {
  const email = randomEmail();
  const passwordHash = crypto.randomBytes(32).toString('hex');

  await fetchJson(app, env, '/auth/register', {
    method: 'POST',
    body: { email, passwordHash }
  }, 200, 'register dashboard user');

  const { json: loginData } = await fetchJson(app, env, '/auth/login', {
    method: 'POST',
    body: { email, passwordHash }
  }, 200, 'login dashboard user');

  expectJwtLike(loginData.token, 'dashboard login token');
  return { token: loginData.token };
}

function parseCspDirectives(csp) {
  return csp
    .split(';')
    .map((value) => value.trim())
    .filter(Boolean)
    .reduce((accumulator, directive) => {
      const [name, ...parts] = directive.split(/\s+/);
      accumulator[name] = parts.join(' ');
      return accumulator;
    }, {});
}

describe('Workers web dashboard pages', () => {
  test('serves login page HTML', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv(), db };
      const res = await app.fetch(new Request('http://localhost/login'), env);
      const html = await res.text();
      assert.equal(res.status, 200);
      assert.ok(res.headers.get('Content-Type')?.includes('text/html'));
      assert.ok(html.includes('name="email"'));
      assert.ok(html.includes('name="password"'));
      assert.ok(html.includes('login-form'));
    } finally {
      await disposeTestDatabase(mf);
    }
  });

  test('serves dashboard page HTML', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv(), db };
      const res = await app.fetch(new Request('http://localhost/dashboard'), env);
      const html = await res.text();
      assert.equal(res.status, 200);
      assert.ok(res.headers.get('Content-Type')?.includes('text/html'));
      assert.ok(html.includes('Refresh'));
      assert.ok(html.includes('Logout'));
      assert.ok(html.includes("LADY'S SOLITAIRE CARD"));
      assert.ok(html.includes('XL Rewards Card'));
      assert.ok(html.includes('totals-list'));
      assert.ok(html.includes('empty-state'));
      assert.ok(html.includes('ccSubcapSyncToken'));
      assert.ok(html.includes('/auth/refresh'));
      assert.ok(html.includes('/meta/cap-policy'));
      assert.ok(html.includes('No synced monthly totals yet.'));
    } finally {
      await disposeTestDatabase(mf);
    }
  });

  test('serves cap policy metadata endpoint', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv(), db };
      const res = await app.fetch(new Request('http://localhost/meta/cap-policy'), env);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.cards["LADY'S SOLITAIRE CARD"].cap, 750);
      assert.equal(json.cards['XL Rewards Card'].cap, 1000);
      assert.equal(typeof json.thresholds.warningRatio, 'number');
      assert.equal(typeof json.styles.warning.background, 'string');
    } finally {
      await disposeTestDatabase(mf);
    }
  });

  test('applies web CSP without weakening API CSP', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv(), db };
      const loginRes = await app.fetch(new Request('http://localhost/login'), env);
      assert.equal(loginRes.status, 200);
      const loginCsp = loginRes.headers.get('Content-Security-Policy') || '';
      const loginDirectives = parseCspDirectives(loginCsp);
      assert.ok(loginDirectives['script-src']?.includes("'nonce-"));
      assert.equal(loginDirectives['connect-src'], "'self'");
      assert.equal(loginDirectives['default-src'], "'none'");

      const { token } = await registerAndLogin(env);
      const apiRes = await app.fetch(new Request('http://localhost/sync/data', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Origin': 'https://pib.uob.com.sg'
        }
      }), env);
      assert.equal(apiRes.status, 200);
      const apiCsp = apiRes.headers.get('Content-Security-Policy');
      const apiDirectives = parseCspDirectives(apiCsp || '');
      assert.equal(apiDirectives['default-src'], "'none'");
      assert.equal(apiDirectives['connect-src'], "'self'");
      assert.equal(apiDirectives['frame-ancestors'], "'none'");
      assert.equal(apiDirectives['base-uri'], "'self'");
      assert.equal(apiDirectives['form-action'], "'self'");
      assert.equal(apiDirectives['script-src'], undefined);
    } finally {
      await disposeTestDatabase(mf);
    }
  });
});
