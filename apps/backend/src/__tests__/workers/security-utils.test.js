import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { csrfProtection, getAuthoritativeOrigin, isOriginAllowed } from '../../middleware/csrf.js';

function createContext({ method = 'POST', headers = {}, env = {} } = {}) {
  const headerMap = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    env,
    req: {
      method,
      header(name) {
        return headerMap.get(name.toLowerCase());
      }
    },
    json(body, status) {
      return { body, status };
    }
  };
}

describe('Workers security utils', () => {
  test('origin normalization and allowlist behavior', () => {
    const allowedOrigins = ['https://pib.uob.com.sg', 'https://cib.maybank2u.com.sg'];

    assert.equal(getAuthoritativeOrigin('null', null), null);
    assert.equal(getAuthoritativeOrigin('chrome-extension://abcdefghijklmnop', null), null);
    assert.equal(getAuthoritativeOrigin('https://evil.example/path', null), 'https://evil.example');
    assert.equal(getAuthoritativeOrigin('https://pib.uob.com.sg', null), 'https://pib.uob.com.sg');

    assert.equal(isOriginAllowed('https://pib.uob.com.sg', allowedOrigins), true);
    assert.equal(isOriginAllowed('https://evil.example', allowedOrigins), false);
  });

  test('csrfProtection enforces origin rules', async () => {
    const allowedOrigins = ['https://pib.uob.com.sg'];
    const middleware = csrfProtection({
      allowedOrigins,
      requireOrigin: true,
      trustedNoOriginHeaderName: 'X-CC-Userscript',
      trustedNoOriginHeaderValue: 'tampermonkey-v1'
    });

    const missingOrigin = createContext({ headers: { 'Content-Type': 'application/json' } });
    const missingResult = await middleware(missingOrigin, async () => 'next');
    assert.equal(missingResult.status, 403);
    assert.equal(missingResult.body.error, 'Forbidden');

    let bypassed = false;
    const trustedOrigin = createContext({
      headers: {
        'Content-Type': 'application/json',
        'X-CC-Userscript': 'tampermonkey-v1'
      }
    });
    const trustedResult = await middleware(trustedOrigin, async () => {
      bypassed = true;
      return 'next';
    });
    assert.equal(bypassed, true);
    assert.equal(trustedResult, 'next');

    const invalidOrigin = createContext({
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://evil.example'
      }
    });
    const invalidResult = await middleware(invalidOrigin, async () => 'next');
    assert.equal(invalidResult.status, 403);
    assert.equal(invalidResult.body.message, 'CSRF validation failed: Invalid origin');
  });
});
