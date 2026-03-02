// targets: evalXPath and waiting helpers.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports } from './helpers/load-userscript-exports.js';
import { createFakeTimers } from './helpers/fake-timers.js';

const exports = await loadExports();

function makeDoc(nodeMap = {}) {
  return {
    evaluate: (xpath) => ({ singleNodeValue: nodeMap[xpath] || null })
  };
}

describe('xpath helpers', () => {
  it('covers eval and wait branches', async () => {
    const timers = createFakeTimers();

    globalThis.document = { evaluate: () => { throw new Error('bad'); } };
    assert.equal(exports.evalXPath('//bad'), null);

    const node = { id: 'target' };
    globalThis.document = {
      documentElement: {},
      evaluate: () => ({ singleNodeValue: node })
    };
    globalThis.MutationObserver = class { observe() {} disconnect() {} };
    globalThis.window = { setTimeout: () => 0, clearTimeout: () => {} };
    timers.bindToWindow(globalThis.window);
    const found = await exports.waitForXPath('//node', 10);
    assert.equal(found, node);

    globalThis.document = makeDoc({});
    const result = await exports.waitForAnyXPath([], 5);
    assert.equal(result, null);

    const tbody = { querySelectorAll: () => [] };
    globalThis.document = makeDoc({ '//tbody': tbody });
    const fallbackPromise = exports.waitForAnyTableBodyRows(['//tbody'], 5, 1);
    await timers.runAllAsync();
    const fallback = await fallbackPromise;
    assert.equal(fallback.tbody, tbody);
    assert.equal(fallback.xpath, '//tbody');

    timers.unbindFromWindow();
  });
});
