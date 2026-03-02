import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import app from '../../index.js';
import { createTestDatabase, createTestEnv, disposeTestDatabase } from './test-utils.js';

function randomEmail() {
  return `web-${crypto.randomBytes(6).toString('hex')}@example.com`;
}

async function registerAndLogin(env) {
  const email = randomEmail();
  const passwordHash = crypto.randomBytes(32).toString('hex');

  const regRes = await app.fetch(new Request('http://localhost/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://pib.uob.com.sg'
    },
    body: JSON.stringify({ email, passwordHash })
  }), env);
  assert.equal(regRes.status, 200, `registration failed with status ${regRes.status}`);

  const loginRes = await app.fetch(new Request('http://localhost/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://pib.uob.com.sg'
    },
    body: JSON.stringify({ email, passwordHash })
  }), env);
  assert.equal(loginRes.status, 200, `login failed with status ${loginRes.status}`);

  const loginData = await loginRes.json();
  assert.strictEqual(typeof loginData.token, 'string', 'login should return a token');
  return { token: loginData.token };
}

describe('Workers web dashboard pages', () => {
  test('serves login page HTML', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv(), db };
      const res = await app.fetch(new Request('http://localhost/login'), env);
      const html = await res.text();
      assert.equal(res.status, 200);
      assert.match(res.headers.get('Content-Type') ?? '', /text\/html/, 'login page should serve text/html');
      assert.match(html, /name="email"/, 'login page should have email input');
      assert.match(html, /name="password"/, 'login page should have password input');
      assert.match(html, /login-form/, 'login page should contain login form');
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
      assert.match(res.headers.get('Content-Type') ?? '', /text\/html/, 'dashboard should serve text/html');

      // User-visible content
      assert.match(html, /Refresh/, 'dashboard should show Refresh button');
      assert.match(html, /Logout/, 'dashboard should show Logout button');
      assert.match(html, /LADY'S SOLITAIRE CARD/, 'dashboard should list Lady\'s Solitaire Card');
      assert.match(html, /XL Rewards Card/, 'dashboard should list XL Rewards Card');

      // Data-binding and API integration
      assert.match(html, /ccSubcapSyncLastActiveAt/, 'dashboard should reference sync timestamp key');
      assert.match(html, /\/auth\/refresh/, 'dashboard should reference auth refresh endpoint');
      assert.match(html, /\/meta\/cap-policy/, 'dashboard should reference cap policy endpoint');

      // UI components and behavior
      assert.match(html, /cap-pill/, 'dashboard should render cap pills');
      assert.match(html, /No synced monthly totals yet\./, 'dashboard should show empty-state message');
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
      assert.strictEqual(typeof json.thresholds.warningRatio, 'number', 'warningRatio should be a number');
      assert.ok(json.thresholds.warningRatio > 0 && json.thresholds.warningRatio < 1, 'warningRatio should be between 0 and 1');
      assert.strictEqual(typeof json.styles.warning.background, 'string', 'warning background should be a CSS string');
      assert.match(json.styles.warning.background, /#[0-9a-fA-F]+|rgb/, 'warning background should be a color value');
    } finally {
      await disposeTestDatabase(mf);
    }
  });

  test('applies web CSP without weakening API CSP', async () => {
    const { mf, db } = await createTestDatabase();
    try {
      const env = { ...createTestEnv(), db };
      const loginRes = await app.fetch(new Request('http://localhost/login'), env);
      const loginCsp = loginRes.headers.get('Content-Security-Policy') || '';
      assert.match(loginCsp, /script-src 'nonce-/, 'login page CSP should include script nonce');
      assert.match(loginCsp, /connect-src 'self'/, 'login page CSP should restrict connect-src to self');

      const { token } = await registerAndLogin(env);
      const apiRes = await app.fetch(new Request('http://localhost/sync/data', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Origin': 'https://pib.uob.com.sg'
        }
      }), env);
      const apiCsp = apiRes.headers.get('Content-Security-Policy');
      assert.equal(
        apiCsp,
        "default-src 'none'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
      );
    } finally {
      await disposeTestDatabase(mf);
    }
  });
});
