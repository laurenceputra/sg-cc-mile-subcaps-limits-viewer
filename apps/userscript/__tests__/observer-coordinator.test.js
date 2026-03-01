// targets: observeTableBody/observeCardContextChanges/observeButtonActionability.
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports } from './helpers/load-userscript-exports.js';
import { createFakeTimers } from './helpers/fake-timers.js';
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

    globalThis.window = { setTimeout: () => 0, clearTimeout: () => {} };
    const timers = createFakeTimers();
    timers.bindToWindow(globalThis.window);

    let onChangeCalled = 0;
    const onChange = () => { onChangeCalled += 1; };
    const stop = exports.observeTableBody(['//tbody'], onChange, 5, 1);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(onChangeCalled, 0, 'debounced callback should not run immediately');
    timers.advanceBy(1);
    assert.equal(onChangeCalled, 1, 'initial refresh should run after debounce window');

    const tableObserver = Observer.instances.find((obs) => obs._observed === tbody);
    assert.equal(typeof stop, 'function');
    assert.equal(typeof onChange, 'function');

    // simulate mutation on table observer
    const initialCalls = onChangeCalled;
    if (tableObserver) {
      tableObserver.trigger([{ type: 'childList' }]);
    }
    assert.equal(onChangeCalled, initialCalls, 'mutation should only schedule refresh');
    timers.advanceBy(1);
    assert.equal(onChangeCalled, initialCalls + 1);

    stop();
    assert.equal(tableObserver?._disconnected, true);
    timers.unbindFromWindow();
  });

  it('observeCardContextChanges calls onChange when snapshot changes', () => {
    const profile = { cardNameXPaths: ['//card'] };
    let node = { textContent: 'XL Rewards Card', innerText: 'XL Rewards Card' };
    globalThis.document = {
      documentElement: {},
      evaluate: () => ({ singleNodeValue: node })
    };
    globalThis.window = { setTimeout: () => 0, clearTimeout: () => {} };
    const timers = createFakeTimers();
    timers.bindToWindow(globalThis.window);

    const Observer = makeObserverClass();
    globalThis.MutationObserver = Observer;

    let called = 0;
    const stop = exports.observeCardContextChanges(profile, { requireVisible: false }, () => { called += 1; }, 1);
    node = { textContent: 'LADY\'S SOLITAIRE CARD', innerText: "LADY'S SOLITAIRE CARD" };
    const observer = Observer.instances[0];
    const initialCalls = called;
    observer.trigger([{ type: 'childList' }]);
    assert.equal(called, initialCalls, 'onChange should not run before debounce delay');
    timers.advanceBy(1);
    assert.equal(called, initialCalls + 1, 'onChange should be called once after trigger');
    stop();
    observer.trigger([{ type: 'childList' }]);
    timers.advanceBy(1);
    assert.equal(called, initialCalls + 1, 'onChange should not be called after stop');
    assert.equal(observer._disconnected, true);
    timers.unbindFromWindow();
  });

  it('observeButtonActionability schedules onChange after mutation', () => {
    const profile = { id: 'uob' };
    globalThis.document = { documentElement: {} };
    globalThis.window = { setTimeout: () => 0, clearTimeout: () => {} };
    const timers = createFakeTimers();
    timers.bindToWindow(globalThis.window);

    const Observer = makeObserverClass();
    globalThis.MutationObserver = Observer;

    let called = 0;
    const stop = exports.observeButtonActionability(profile, {}, () => { called += 1; }, 1);
    const observer = Observer.instances[0];
    const initialCalls = called;
    observer.trigger([{ type: 'childList' }]);
    assert.equal(called, initialCalls, 'onChange should be debounced');
    timers.advanceBy(1);
    assert.equal(called, initialCalls + 1, 'onChange should be called once after trigger');
    stop();
    observer.trigger([{ type: 'childList' }]);
    timers.advanceBy(1);
    assert.equal(called, initialCalls + 1, 'onChange should not be called after stop');
    assert.equal(observer._disconnected, true);
    timers.unbindFromWindow();
  });
});
