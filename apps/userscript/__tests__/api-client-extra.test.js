import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports } from './helpers/load-userscript-exports.js';

const exports = await loadExports();

afterEach(() => {
  globalThis.GM_xmlhttpRequest = undefined;
  globalThis.fetch = undefined;
});

describe('ApiClient extra coverage', () => {
  it('request adds GM header and token on GM transport', async () => {
    let capturedHeaders = null;
    globalThis.GM_xmlhttpRequest = ({ headers, onload }) => {
      capturedHeaders = headers;
      onload({ status: 200, statusText: 'OK', responseText: '{}' });
    };

    const client = new exports.ApiClient('https://example.com');
    client.setToken('token-123');
    await client.request('/sync/data', { method: 'GET' });

    assert.equal(capturedHeaders.Authorization, 'Bearer token-123');
    assert.equal(capturedHeaders['X-CC-Userscript'], 'tampermonkey-v1');
  });

  it('login/register update token and call request', async () => {
    let lastEndpoint = '';
    const client = new exports.ApiClient('https://example.com');
    client.request = async (endpoint) => {
      lastEndpoint = endpoint;
      return { token: endpoint.includes('login') ? 'tok-login' : 'tok-register' };
    };

    const login = await client.login('user@example.com', 'hash');
    assert.equal(login.token, 'tok-login');
    assert.equal(client.token, 'tok-login');
    assert.equal(lastEndpoint, '/auth/login');

    const register = await client.register('user@example.com', 'hash');
    assert.equal(register.token, 'tok-register');
    assert.equal(client.token, 'tok-register');
    assert.equal(lastEndpoint, '/auth/register');
  });

  it('deleteUserData calls DELETE endpoint', async () => {
    let endpoint = '';
    let method = '';
    const client = new exports.ApiClient('https://example.com');
    client.request = async (path, options) => {
      endpoint = path;
      method = options.method;
      return { ok: true };
    };

    const result = await client.deleteUserData();
    assert.deepEqual(result, { ok: true });
    assert.equal(endpoint, '/user/data');
    assert.equal(method, 'DELETE');
  });
});
