// targets: cap policy cache + backend fetch paths.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports } from './helpers/load-userscript-exports.js';
import { snapshotGlobals, restoreGlobals } from './helpers/reset-globals.js';

const exports = await loadExports();

const CACHE_KEY = 'ccSubcapCapPolicyCache';
const CONFIG_KEY = 'ccSubcapSyncConfig';

function makeStore() {
  const store = new Map();
  return {
    get: (key, fallback) => (store.has(key) ? store.get(key) : fallback),
    set: (key, value) => store.set(key, value),
    remove: (key) => store.delete(key),
    raw: store
  };
}

describe('cap policy cache', () => {
  let snapshot;
  beforeEach(() => {
    snapshot = snapshotGlobals();
  });
  afterEach(() => {
    restoreGlobals(snapshot);
  });
  it('readCachedCapPolicy returns null for empty or invalid cache', () => {
    const store = makeStore();
    globalThis.GM_getValue = (key, fallback) => store.get(key, fallback);

    assert.equal(exports.readCachedCapPolicy(), null);

    store.set(CACHE_KEY, 'not-json');
    assert.equal(exports.readCachedCapPolicy(), null);

    store.set(CACHE_KEY, JSON.stringify({ savedAt: 'nope', policy: {} }));
    assert.equal(exports.readCachedCapPolicy(), null);

    const expired = { savedAt: Date.now() - 3 * 24 * 60 * 60 * 1000, policy: {} };
    store.set(CACHE_KEY, JSON.stringify(expired));
    assert.equal(exports.readCachedCapPolicy(), null);
  });

  it('writeCachedCapPolicy stores policy with timestamp', () => {
    const store = makeStore();
    globalThis.GM_getValue = (key, fallback) => store.get(key, fallback);
    globalThis.GM_setValue = (key, value) => store.set(key, value);

    const policy = { version: 2, thresholds: { warningRatio: 0.9, criticalRatio: 1 }, cards: {} };
    exports.writeCachedCapPolicy(policy);

    const raw = store.get(CACHE_KEY, '');
    const parsed = JSON.parse(raw);
    assert.equal(typeof parsed.savedAt, 'number');
    assert.equal(parsed.policy.version, 2);
  });

  it('readCachedCapPolicy normalizes stored policy', () => {
    const store = makeStore();
    globalThis.GM_getValue = (key, fallback) => store.get(key, fallback);

    const cached = {
      savedAt: Date.now(),
      policy: { version: 2, thresholds: { warningRatio: 0.5 }, cards: { Test: { mode: 'combined', cap: 123 } } }
    };
    store.set(CACHE_KEY, JSON.stringify(cached));

    const parsed = exports.readCachedCapPolicy();
    assert.equal(parsed.thresholds.criticalRatio, exports.EMBEDDED_CAP_POLICY.thresholds.criticalRatio);
    assert.equal(parsed.cards.Test.cap, 123);
  });

  it('getConfiguredPolicyServerUrl reads config and trims', () => {
    const store = makeStore();
    globalThis.GM_getValue = (key, fallback) => store.get(key, fallback);
    store.set(CONFIG_KEY, JSON.stringify({ serverUrl: ' https://example.com ' }));

    assert.equal(exports.getConfiguredPolicyServerUrl(), 'https://example.com');

    store.set(CONFIG_KEY, 'not-json');
    assert.equal(exports.getConfiguredPolicyServerUrl(), '');
  });

  it('fetchCapPolicyFromBackend validates urls', async () => {
    await assert.rejects(
      () => exports.fetchCapPolicyFromBackend('ftp://example.com'),
      /HTTP or HTTPS/
    );
  });

  it('ensureCapPolicyLoaded returns embedded policy when no server url', async () => {
    const store = makeStore();
    globalThis.GM_getValue = (key, fallback) => store.get(key, fallback);
    globalThis.GM_xmlhttpRequest = undefined;
    store.set(CONFIG_KEY, JSON.stringify({ serverUrl: '' }));

    const policy = await exports.ensureCapPolicyLoaded(true);
    assert.equal(policy, exports.EMBEDDED_CAP_POLICY);
  });

  it('ensureCapPolicyLoaded fetches policy and caches it', async () => {
    const store = makeStore();
    globalThis.GM_getValue = (key, fallback) => store.get(key, fallback);
    globalThis.GM_setValue = (key, value) => store.set(key, value);
    globalThis.GM_xmlhttpRequest = undefined;
    store.set(CONFIG_KEY, JSON.stringify({ serverUrl: 'https://example.com' }));

    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({
        version: 3,
        thresholds: { warningRatio: 0.8, criticalRatio: 0.95 },
        cards: { Sample: { mode: 'combined', cap: 321 } }
      })
    });

    const policy = await exports.ensureCapPolicyLoaded(true);
    assert.equal(policy.version, 3);
    assert.equal(policy.cards.Sample.cap, 321);

    const cached = exports.readCachedCapPolicy();
    assert.equal(cached.version, 3);
  });

  it('ensureCapPolicyLoaded falls back to cache on fetch error', async () => {
    const store = makeStore();
    globalThis.GM_getValue = (key, fallback) => store.get(key, fallback);
    globalThis.GM_setValue = (key, value) => store.set(key, value);
    globalThis.GM_xmlhttpRequest = undefined;
    store.set(CONFIG_KEY, JSON.stringify({ serverUrl: 'https://example.com' }));

    const cached = {
      savedAt: Date.now(),
      policy: { version: 7, thresholds: { warningRatio: 0.9, criticalRatio: 1 }, cards: { Cached: { mode: 'combined', cap: 999 } } }
    };
    store.set(CACHE_KEY, JSON.stringify(cached));

    globalThis.fetch = async () => ({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      text: async () => '{"message":"nope"}'
    });

    const policy = await exports.ensureCapPolicyLoaded(true);
    assert.equal(policy.version, 7);
    assert.equal(policy.cards.Cached.cap, 999);
  });
});
