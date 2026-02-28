// targets: StorageAdapter fallback paths when GM/localStorage throws.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports } from './helpers/load-userscript-exports.js';
import { snapshotGlobals, restoreGlobals } from './helpers/reset-globals.js';

const exports = await loadExports();

describe('StorageAdapter error fallback', () => {
  let snapshot;
  beforeEach(() => {
    snapshot = snapshotGlobals();
  });
  afterEach(() => {
    restoreGlobals(snapshot);
  });
  it('falls back to localStorage when GM storage throws', () => {
    const local = new Map();
    globalThis.window.localStorage = {
      getItem: (key) => local.get(key) ?? null,
      setItem: (key, value) => { local.set(key, value); },
      removeItem: (key) => { local.delete(key); }
    };

    globalThis.GM_getValue = () => { throw new Error('gm get fail'); };
    globalThis.GM_setValue = () => { throw new Error('gm set fail'); };
    globalThis.GM_deleteValue = () => { throw new Error('gm del fail'); };

    const storage = new exports.StorageAdapter();
    local.set('key', 'value');
    assert.equal(storage.get('key', 'fallback'), 'value');

    storage.set('key', 'next');
    assert.equal(local.get('key'), 'next');

    storage.remove('key');
    assert.equal(local.has('key'), false);
  });
});
