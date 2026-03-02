// targets: StorageAdapter with GM and localStorage branches.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports } from './helpers/load-userscript-exports.js';
import { snapshotGlobals, restoreGlobals } from './helpers/reset-globals.js';

const exports = await loadExports();

describe('StorageAdapter', () => {
  let snapshot;
  beforeEach(() => {
    snapshot = snapshotGlobals();
  });
  afterEach(() => {
    restoreGlobals(snapshot);
  });
  it('uses GM storage when available', () => {
    globalThis.GM_getValue = undefined;
    globalThis.GM_setValue = undefined;
    globalThis.GM_deleteValue = undefined;
    const store = new Map();
    globalThis.GM_getValue = (key, fallback) => (store.has(key) ? store.get(key) : fallback);
    globalThis.GM_setValue = (key, value) => { store.set(key, value); };
    globalThis.GM_deleteValue = (key) => { store.delete(key); };

    const adapter = new exports.StorageAdapter();
    adapter.set('a', '1');
    assert.equal(adapter.get('a', null), '1');
    adapter.remove('a');
    assert.equal(adapter.get('a', 'fallback'), 'fallback');
  });

  it('falls back to localStorage when GM throws', () => {
    globalThis.GM_getValue = undefined;
    globalThis.GM_setValue = undefined;
    globalThis.GM_deleteValue = undefined;
    const localStore = new Map();
    globalThis.window.localStorage = {
      getItem: (key) => (localStore.has(key) ? localStore.get(key) : null),
      setItem: (key, value) => { localStore.set(key, value); },
      removeItem: (key) => { localStore.delete(key); }
    };
    globalThis.GM_getValue = () => { throw new Error('GM error'); };
    globalThis.GM_setValue = () => { throw new Error('GM error'); };
    globalThis.GM_deleteValue = () => { throw new Error('GM error'); };

    const adapter = new exports.StorageAdapter();
    adapter.set('b', '2');
    assert.equal(adapter.get('b', null), '2');
    adapter.remove('b');
    assert.equal(adapter.get('b', 'fallback'), 'fallback');
  });
});
