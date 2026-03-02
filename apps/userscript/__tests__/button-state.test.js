// targets: setButtonState (visibility + enablement branches).
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports } from './helpers/load-userscript-exports.js';
import { snapshotGlobals, restoreGlobals } from './helpers/reset-globals.js';

const exports = await loadExports();

function makeButton() {
  return {
    disabled: false,
    attributes: {},
    classList: {
      _set: new Set(),
      toggle: function (val, force) {
        if (force === undefined) {
          if (this._set.has(val)) {
            this._set.delete(val);
            return false;
          }
          this._set.add(val);
          return true;
        }
        if (force) {
          this._set.add(val);
        } else {
          this._set.delete(val);
        }
        return force;
      },
      contains: function (val) {
        return this._set.has(val);
      }
    },
    setAttribute: function (key, value) {
      this.attributes[key] = String(value);
    }
  };
}

describe('button state helper', () => {
  let snapshot;
  beforeEach(() => {
    snapshot = snapshotGlobals();
  });
  afterEach(() => {
    restoreGlobals(snapshot);
  });
  it('setButtonState is a no-op when button missing', () => {
    globalThis.document.getElementById = () => null;
    assert.doesNotThrow(() => exports.setButtonState({ visible: true, enabled: true }));
  });

  it('setButtonState toggles visibility and enabled states', () => {
    const button = makeButton();
    globalThis.document.getElementById = () => button;

    exports.setButtonState({ visible: false, enabled: false });
    assert.equal(button.classList.contains('cc-subcap-hidden'), true);
    assert.equal(button.disabled, true);
    assert.equal(button.attributes['aria-disabled'], 'true');

    exports.setButtonState({ visible: true, enabled: true });
    assert.equal(button.classList.contains('cc-subcap-hidden'), false);
    assert.equal(button.disabled, false);
    assert.equal(button.attributes['aria-disabled'], 'false');
  });
});
