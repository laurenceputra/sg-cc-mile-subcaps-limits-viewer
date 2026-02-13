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

  await app.fetch(new Request('http://localhost/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://pib.uob.com.sg'
    },
    body: JSON.stringify({ email, passwordHash })
  }), env);

  const loginRes = await app.fetch(new Request('http://localhost/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://pib.uob.com.sg'
    },
    body: JSON.stringify({ email, passwordHash })
  }), env);

  const loginData = await loginRes.json();
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
      assert.ok(html.includes('ccSubcapSyncLastActiveAt'));
      assert.ok(html.includes('/auth/refresh'));
      assert.ok(html.includes('/meta/cap-policy'));
      assert.ok(html.includes('slice(0, 2)'));
      assert.ok(html.includes('cardSettings?.monthlyTotals'));
      assert.ok(html.includes('cap-pill'));
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
      const loginCsp = loginRes.headers.get('Content-Security-Policy') || '';
      assert.ok(loginCsp.includes("script-src 'nonce-"));
      assert.ok(loginCsp.includes("connect-src 'self'"));

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
