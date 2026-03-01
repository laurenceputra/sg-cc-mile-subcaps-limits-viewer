// targets: DOM wiring helpers (ensureUiStyles, createButton) for branch coverage.
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports } from './helpers/load-userscript-exports.js';
import { captureEventListeners } from './helpers/dom-events.js';
import { snapshotGlobals, restoreGlobals } from './helpers/reset-globals.js';

const exports = await loadExports();
const globalsSnapshot = snapshotGlobals();

afterEach(() => {
  restoreGlobals(globalsSnapshot);
});

describe('DOM wiring helpers', () => {
  it('ensureUiStyles injects styles via GM_addStyle', () => {
    let called = false;
    let receivedCss = '';
    globalThis.GM_addStyle = (css) => { called = true; receivedCss = css; };
    exports.ensureUiStyles({
      border: '#ccc',
      surface: '#fff',
      accent: '#000',
      accentSoft: '#eee',
      accentText: '#000',
      accentShadow: 'none',
      warning: '#f90',
      warningSoft: '#fff7e6',
      errorBorder: '#f00',
      errorSoft: '#fee',
      errorText: '#f00',
      successBorder: '#0f0',
      successSoft: '#efe',
      success: '#0f0',
      panel: '#f8f8f8',
      text: '#111',
      muted: '#666',
      overlay: 'rgba(0,0,0,0.1)',
      shadow: 'none'
    });
    assert.equal(called, true);
    assert.match(receivedCss, /\.cc-subcap-overlay/, 'injected CSS should include overlay class');
    assert.match(receivedCss, /\.cc-subcap-panel/, 'injected CSS should include panel class');
  });

  it('createButton appends button and wires click', () => {
    let clicked = false;
    const created = {
      id: '',
      type: '',
      textContent: '',
      classList: { add: () => {}, contains: () => false },
      setAttribute: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      disabled: false
    };
    const listenerCapture = captureEventListeners(created);
    globalThis.document.getElementById = () => null;
    globalThis.document.createElement = () => created;
    globalThis.document.body = { appendChild: () => {} };

    exports.createButton(() => { clicked = true; }, { enabled: true });
    assert.equal(created.id, 'cc-subcap-btn');
    assert.equal(created.type, 'button');
    assert.equal(created.textContent, 'Subcap Tools');
    assert.equal(listenerCapture.getListeners('click').length, 1, 'click listener should be registered once');
    assert.equal(clicked, false);
    listenerCapture.dispatch('click');
    assert.equal(clicked, true);
    listenerCapture.restore();
  });
});
