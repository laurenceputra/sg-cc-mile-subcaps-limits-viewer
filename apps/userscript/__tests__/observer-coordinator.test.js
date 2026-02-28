// targets: observeTableBody/observeCardContextChanges/observeButtonActionability.
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports } from './helpers/load-userscript-exports.js';
import { snapshotGlobals, restoreGlobals } from './helpers/reset-globals.js';

const exports = await loadExports();
const globalsSnapshot = snapshotGlobals();

afterEach(() => {
  restoreGlobals(globalsSnapshot);
});

function makeObserverClass() {
  class Observer {
    constructor(callback) {
      this._callback = callback;
      this._disconnected = false;
      this._observed = null;
      Observer.instances.push(this);
    }

    observe(target) {
      this._observed = target;
    }

    disconnect() {
      this._disconnected = true;
    }

    trigger(mutations) {
      if (!this._disconnected) {
        this._callback(mutations);
      }
    }
  }
  Observer.instances = [];
  return Observer;
}

describe('observer helpers', () => {
  it('observeTableBody schedules refresh on tbody change', async () => {
    const tbody = { isConnected: true };
    globalThis.document = {
      documentElement: {},
      evaluate: () => ({ singleNodeValue: tbody })
    };

    const Observer = makeObserverClass();
    globalThis.MutationObserver = Observer;

    let scheduled = false;
    globalThis.window = {
      setTimeout: (fn) => { scheduled = true; fn(); return 1; },
      clearTimeout: () => {}
    };

    let onChangeCalled = 0;
    const onChange = () => { onChangeCalled += 1; };
    const stop = exports.observeTableBody(['//tbody'], onChange, 5, 1);
    await new Promise((resolve) => setImmediate(resolve));

    const tableObserver = Observer.instances.find((obs) => obs._observed === tbody);
    assert.equal(typeof stop, 'function');
    assert.equal(typeof onChange, 'function');

    // simulate mutation on table observer
    const initialCalls = onChangeCalled;
    if (tableObserver) {
      tableObserver.trigger([{ type: 'childList' }]);
    }
    assert.equal(scheduled, true);
    assert.equal(onChangeCalled, initialCalls + 1);

    stop();
    assert.equal(tableObserver?._disconnected, true);
  });

  it('observeCardContextChanges calls onChange when snapshot changes', () => {
    const profile = { cardNameXPaths: ['//card'] };
    let node = { textContent: 'XL Rewards Card', innerText: 'XL Rewards Card' };
    globalThis.document = {
      documentElement: {},
      evaluate: () => ({ singleNodeValue: node })
    };
    globalThis.window = {
      setTimeout: (fn) => { fn(); return 1; },
      clearTimeout: () => {}
    };

    const Observer = makeObserverClass();
    globalThis.MutationObserver = Observer;

    let called = 0;
    const stop = exports.observeCardContextChanges(profile, { requireVisible: false }, () => { called += 1; }, 1);
    node = { textContent: 'LADY\'S SOLITAIRE CARD', innerText: "LADY'S SOLITAIRE CARD" };
    const observer = Observer.instances[0];
    const initialCalls = called;
    observer.trigger([{ type: 'childList' }]);
    assert.equal(called, initialCalls + 1, 'onChange should be called once after trigger');
    stop();
    observer.trigger([{ type: 'childList' }]);
    assert.equal(called, initialCalls + 1, 'onChange should not be called after stop');
    assert.equal(observer._disconnected, true);
  });

  it('observeButtonActionability schedules onChange after mutation', () => {
    const profile = { id: 'uob' };
    globalThis.document = { documentElement: {} };
    globalThis.window = {
      setTimeout: (fn) => { fn(); return 1; },
      clearTimeout: () => {}
    };

    const Observer = makeObserverClass();
    globalThis.MutationObserver = Observer;

    let called = 0;
    const stop = exports.observeButtonActionability(profile, {}, () => { called += 1; }, 1);
    const observer = Observer.instances[0];
    const initialCalls = called;
    observer.trigger([{ type: 'childList' }]);
    assert.equal(called, initialCalls + 1, 'onChange should be called once after trigger');
    stop();
    observer.trigger([{ type: 'childList' }]);
    assert.equal(called, initialCalls + 1, 'onChange should not be called after stop');
    assert.equal(observer._disconnected, true);
  });
});
