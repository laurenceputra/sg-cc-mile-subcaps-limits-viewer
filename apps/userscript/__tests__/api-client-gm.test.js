// targets: ApiClient GM transport error branches.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports } from './helpers/load-userscript-exports.js';
import { snapshotGlobals, restoreGlobals } from './helpers/reset-globals.js';

const exports = await loadExports();

describe('ApiClient GM transport', () => {
  let snapshot;
  beforeEach(() => {
    snapshot = snapshotGlobals();
    delete globalThis.fetch;
  });

  afterEach(() => {
    restoreGlobals(snapshot);
  });

  it('requestWithGM rejects on error', async () => {
    globalThis.GM_xmlhttpRequest = ({ onerror }) => {
      onerror();
    };
    const client = new exports.ApiClient('https://example.com');
    await assert.rejects(() => client.request('/auth/login', { method: 'POST' }), /Network connection failed/);
  });

  it('requestWithGM rejects on timeout', async () => {
    globalThis.GM_xmlhttpRequest = ({ ontimeout }) => {
      ontimeout();
    };
    const client = new exports.ApiClient('https://example.com');
    await assert.rejects(() => client.request('/auth/login', { method: 'POST' }), /Request timed out/);
  });
});
