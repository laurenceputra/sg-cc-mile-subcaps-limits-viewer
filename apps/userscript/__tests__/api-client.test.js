// targets: ApiClient transport + error handling branches for coverage lift.
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports } from './helpers/load-userscript-exports.js';

const exports = await loadExports();

afterEach(() => {
  globalThis.GM_xmlhttpRequest = undefined;
  globalThis.fetch = undefined;
});

describe('ApiClient', () => {
  it('requestWithFetch parses json and handles invalid json', async () => {
    const client = new exports.ApiClient('https://example.com');

    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => '{"ok":true}'
    });

    const parsed = await client.requestWithFetch('https://example.com/test', { method: 'GET' });
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.data, { ok: true });

    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => 'not-json'
    });

    const fallback = await client.requestWithFetch('https://example.com/test', { method: 'GET' });
    assert.equal(fallback.ok, true);
    assert.equal(fallback.data, null);
  });

  it('requestWithGM resolves ok response and handles invalid json', async () => {
    globalThis.GM_xmlhttpRequest = ({ onload }) => {
      onload({ status: 200, statusText: 'OK', responseText: '{"hello":"world"}' });
    };
    const client = new exports.ApiClient('https://example.com');
    const okResponse = await client.requestWithGM('https://example.com/test', { method: 'GET' });
    assert.equal(okResponse.ok, true);
    assert.deepEqual(okResponse.data, { hello: 'world' });

    globalThis.GM_xmlhttpRequest = ({ onload }) => {
      onload({ status: 200, statusText: 'OK', responseText: 'bad-json' });
    };
    const invalidJson = await client.requestWithGM('https://example.com/test', { method: 'GET' });
    assert.equal(invalidJson.ok, true);
    assert.equal(invalidJson.data, null);
  });

  it('requestWithGM rejects on error or timeout', async () => {
    const client = new exports.ApiClient('https://example.com');

    globalThis.GM_xmlhttpRequest = ({ onerror }) => {
      onerror();
    };
    await assert.rejects(
      () => client.requestWithGM('https://example.com/test', { method: 'GET' }),
      /Network connection failed/
    );

    globalThis.GM_xmlhttpRequest = ({ ontimeout }) => {
      ontimeout();
    };
    await assert.rejects(
      () => client.requestWithGM('https://example.com/test', { method: 'GET' }),
      /Request timed out/
    );
  });

  it('request uses fetch path and throws on non-ok response', async () => {
    globalThis.GM_xmlhttpRequest = undefined;
    globalThis.fetch = async () => ({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      text: async () => '{"message":"nope"}'
    });
    const client = new exports.ApiClient('https://example.com');
    await assert.rejects(
      () => client.request('/auth/login', { method: 'POST' }),
      (error) => {
        assert.equal(error.message, 'nope');
        assert.equal(error.status, 500);
        assert.equal(error.code, '');
        assert.deepEqual(error.responseData, { message: 'nope' });
        return true;
      }
    );
  });

  it('request exposes code metadata from non-ok response payload', async () => {
    globalThis.GM_xmlhttpRequest = undefined;
    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => '{"message":"invalid credentials","code":"invalid_credentials"}'
    });

    const client = new exports.ApiClient('https://example.com');
    await assert.rejects(
      () => client.request('/auth/login', { method: 'POST' }),
      (error) => {
        assert.equal(error.message, 'invalid credentials');
        assert.equal(error.status, 401);
        assert.equal(error.code, 'invalid_credentials');
        assert.deepEqual(error.responseData, {
          message: 'invalid credentials',
          code: 'invalid_credentials'
        });
        return true;
      }
    );
  });

  it('request falls back to backend error field when message is absent', async () => {
    globalThis.GM_xmlhttpRequest = undefined;
    globalThis.fetch = async () => ({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => '{"error":"Registration failed"}'
    });

    const client = new exports.ApiClient('https://example.com');
    await assert.rejects(
      () => client.request('/auth/register', { method: 'POST' }),
      (error) => {
        assert.equal(error.message, 'Registration failed');
        assert.equal(error.status, 400);
        assert.deepEqual(error.responseData, { error: 'Registration failed' });
        return true;
      }
    );
  });

  it('request returns data and sends auth header', async () => {
    globalThis.GM_xmlhttpRequest = undefined;
    let capturedHeaders = null;
    globalThis.fetch = async (_url, config) => {
      capturedHeaders = config.headers;
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => '{"token":"abc"}'
      };
    };

    const client = new exports.ApiClient('https://example.com');
    client.setToken('token-123');

    const response = await client.request('/auth/login', { method: 'POST' });
    assert.deepEqual(response, { token: 'abc' });
    assert.equal(capturedHeaders.Authorization, 'Bearer token-123');
  });
});
