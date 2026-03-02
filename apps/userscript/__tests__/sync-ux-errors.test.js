// targets: sync UI negative branches and validations.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports } from './helpers/load-userscript-exports.js';
import { createFakeTimers } from './helpers/fake-timers.js';

const exports = await loadExports();

function makeElement(tag = 'div') {
  const children = [];
  return {
    tagName: tag,
    children,
    id: '',
    value: '',
    textContent: '',
    innerHTML: '',
    style: {},
    disabled: false,
    type: '',
    classList: {
      _set: new Set(),
      add: function (...values) { values.forEach((val) => this._set.add(val)); },
      remove: function (...values) { values.forEach((val) => this._set.delete(val)); },
      contains: function (val) { return this._set.has(val); },
      toggle: function (val, force) {
        if (force === undefined) {
          if (this._set.has(val)) { this._set.delete(val); return false; }
          this._set.add(val); return true;
        }
        if (force) { this._set.add(val); } else { this._set.delete(val); }
        return force;
      }
    },
    attributes: {},
    appendChild: function (node) { children.push(node); return node; },
    replaceWith: () => {},
    remove: () => {},
    setAttribute: function (key, value) { this.attributes[key] = String(value); },
    removeAttribute: function (key) { delete this.attributes[key]; },
    addEventListener: function (_event, handler) { this._handler = handler; },
    querySelector: function (selector) { return this._queryMap?.[selector] || null; },
    querySelectorAll: function () { return []; }
  };
}

function stubDocument() {
  const elementsById = new Map();
  const overlayNodes = [];
  const body = makeElement('body');
  body.appendChild = (node) => { overlayNodes.push(node); return node; };

  const documentStub = {
    head: { appendChild: () => {} },
    body,
    documentElement: {},
    createElement: (tag) => makeElement(tag),
    getElementById: (id) => elementsById.get(id) || null,
    evaluate: () => ({ singleNodeValue: null })
  };

  return { documentStub, elementsById, overlayNodes };
}

describe('sync UI errors', () => {
  it('covers unlock, sync, and setup error branches', async () => {
    const { documentStub, overlayNodes } = stubDocument();
    globalThis.document = documentStub;
    globalThis.window = { setTimeout: () => 0, clearTimeout: () => {} };
    const timers = createFakeTimers();
    timers.bindToWindow(globalThis.window);

    const statusDiv = makeElement('div');
    const passphraseInput = makeElement('input');
    const rememberInput = { checked: false };
    const unlockButton = makeElement('button');
    const syncNowButton = makeElement('button');

    const container = makeElement('div');
    container._queryMap = {
      '#sync-status': statusDiv,
      '#sync-unlock-passphrase': passphraseInput,
      '#sync-remember-unlock': rememberInput,
      '#unlock-sync-btn': unlockButton,
      '#sync-now-btn': syncNowButton,
      '#disable-sync-btn': makeElement('button')
    };
    documentStub.createElement = () => container;

    const syncManager = {
      isEnabled: () => true,
      isUnlocked: () => false,
      hasRememberedUnlockCache: () => false,
      unlockSync: async () => ({ success: false, error: 'bad-pass' }),
      tryUnlockFromRememberedCache: async () => false,
      sync: async () => ({ success: false, error: 'sync-failed' }),
      config: { email: 'a@example.com', lastSync: 0, tier: 'free' }
    };

    exports.createSyncTab(syncManager, 'Card', {}, [], {}, () => {});
    passphraseInput.value = 'bad';
    await unlockButton._handler();
    assert.equal(statusDiv.textContent, 'Unlock failed: bad-pass');
    assert.equal(statusDiv.attributes['data-variant'], 'warning');

    syncManager.isUnlocked = () => true;
    await syncNowButton._handler();
    assert.equal(statusDiv.textContent, 'Sync failed: sync-failed');
    assert.equal(statusDiv.attributes['data-variant'], 'error');

    const overlay = makeElement('div');
    const setupStatus = makeElement('div');
    const serverUrl = makeElement('input');
    const email = makeElement('input');
    const passphrase = makeElement('input');
    const remember = { checked: true };
    const cancelButton = makeElement('button');
    const saveButton = makeElement('button');

    overlay._queryMap = {
      '#sync-setup-status': setupStatus,
      '#sync-server-url': serverUrl,
      '#sync-email': email,
      '#sync-passphrase': passphrase,
      '#sync-remember-unlock-setup': remember,
      '#sync-setup-cancel': cancelButton,
      '#sync-setup-save': saveButton
    };
    documentStub.createElement = () => overlay;

    let setupCalled = false;
    const setupManager = {
      setupSync: async () => { setupCalled = true; return { success: false, error: 'nope' }; }
    };
    exports.showSyncSetupDialog(setupManager, { border: '#000' }, () => {});

    serverUrl.value = 'not-a-url';
    email.value = 'a@example.com';
    passphrase.value = 'secret';
    await saveButton._handler();
    assert.equal(setupCalled, false);
    assert.match(setupStatus.textContent, /Invalid URL|HTTP or HTTPS/, 'should show URL validation error');

    serverUrl.value = 'https://example.com';
    await saveButton._handler();
    assert.equal(setupCalled, true);
    assert.equal(setupStatus.textContent, 'Setup failed: nope');
    assert.equal(overlayNodes.length, 1, 'should append exactly 1 overlay node');
    timers.unbindFromWindow();
  });
});
