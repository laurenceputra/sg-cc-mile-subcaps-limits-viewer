// targets: evalXPath and waiting helpers.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports } from './helpers/load-userscript-exports.js';

const exports = await loadExports();

function makeDoc(nodeMap = {}) {
  return {
    evaluate: (xpath) => ({ singleNodeValue: nodeMap[xpath] || null })
  };
}

describe('xpath helpers', () => {
  it('covers eval and wait branches', async () => {
    globalThis.document = { evaluate: () => { throw new Error('bad'); } };
    assert.equal(exports.evalXPath('//bad'), null);

    const node = { id: 'target' };
    globalThis.document = {
      documentElement: {},
      evaluate: () => ({ singleNodeValue: node })
    };
    globalThis.MutationObserver = class { observe() {} disconnect() {} };
    globalThis.window = {
      setTimeout: (fn) => { fn(); return 0; },
      clearTimeout: () => {}
    };
    const found = await exports.waitForXPath('//node', 10);
    assert.equal(found, node);

    globalThis.document = makeDoc({});
    const result = await exports.waitForAnyXPath([], 5);
    assert.equal(result, null);

    const tbody = { querySelectorAll: () => [] };
    globalThis.document = makeDoc({ '//tbody': tbody });
    let now = 0;
    const originalNow = Date.now;
    Date.now = () => { now += 1; return now; };
    const fallback = await exports.waitForAnyTableBodyRows(['//tbody'], 5, 1);
    Date.now = originalNow;
    assert.equal(fallback.tbody, tbody);
    assert.equal(fallback.xpath, '//tbody');
  });
});
