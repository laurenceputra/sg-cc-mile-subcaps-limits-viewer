// targets: card context + profile resolution helpers.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports } from './helpers/load-userscript-exports.js';
import { snapshotGlobals, restoreGlobals } from './helpers/reset-globals.js';

const exports = await loadExports();

function makeElement(text) {
  return {
    textContent: text,
    isConnected: true,
    getBoundingClientRect: () => ({ width: 10, height: 10 })
  };
}

describe('card context helpers', () => {
  let snapshot;
  beforeEach(() => {
    snapshot = snapshotGlobals();
  });
  afterEach(() => {
    restoreGlobals(snapshot);
  });
  it('isElementVisible rejects non-elements and hidden styles', () => {
    globalThis.Element = class {};
    const element = new Element();
    element.isConnected = true;
    element.getBoundingClientRect = () => ({ width: 10, height: 10 });
    globalThis.window = {
      getComputedStyle: () => ({ display: 'none', visibility: 'visible', opacity: '1' })
    };
    assert.equal(exports.isElementVisible(element), false);

    globalThis.window.getComputedStyle = () => ({ display: 'block', visibility: 'visible', opacity: '1' });
    assert.equal(exports.isElementVisible(element), true);
  });

  it('findActiveCardName resolves first matching xpath', () => {
    const profile = { cardNameXPaths: ['//path1', '//path2'] };
    const nodes = {
      '//path1': makeElement("LADY'S SOLITAIRE CARD"),
      '//path2': makeElement('XL Rewards Card')
    };
    globalThis.document.evaluate = (xpath) => ({ singleNodeValue: nodes[xpath] || null });
    const match = exports.findActiveCardName(profile, { requireVisible: false });
    assert.equal(match.name, "LADY'S SOLITAIRE CARD");
  });

  it('findActiveCardName respects visibility requirement', () => {
    const profile = { cardNameXPaths: ['//path1'] };
    const node = makeElement('XL Rewards Card');
    globalThis.document.evaluate = () => ({ singleNodeValue: node });
    globalThis.window.getComputedStyle = () => ({ display: 'none', visibility: 'visible', opacity: '1' });
    const match = exports.findActiveCardName(profile, { requireVisible: true });
    assert.equal(match, null);
  });

  it('matchesProfile checks host and path', () => {
    globalThis.window = {
      location: { hostname: 'pib.uob.com.sg', href: 'https://pib.uob.com.sg/PIBCust/2FA/processSubmit.do', pathname: '/PIBCust/2FA/processSubmit.do' }
    };
    const profile = { host: 'pib.uob.com.sg', pathPrefix: '/PIBCust' };
    assert.equal(exports.matchesProfile(profile), true);
    const bad = { host: 'example.com', pathPrefix: '/PIBCust' };
    assert.equal(exports.matchesProfile(bad), false);
  });

  it('isSupportedCardContext handles unresolved and mismatched profile', () => {
    const profile = { id: 'uob' };
    assert.equal(exports.isSupportedCardContext(profile, { cardName: '' }, true), true);
    assert.equal(exports.isSupportedCardContext(profile, { cardName: '' }, false), false);

    const context = { cardName: "LADY'S SOLITAIRE CARD", profileId: 'other' };
    assert.equal(exports.isSupportedCardContext(profile, context), false);
  });

  it('resolveActiveCardContext wraps findActiveCardName', () => {
    const profile = { id: 'uob', cardNameXPaths: ['//path1'] };
    const node = makeElement("LADY'S SOLITAIRE CARD");
    globalThis.document.evaluate = () => ({ singleNodeValue: node });
    const context = exports.resolveActiveCardContext(profile, { requireVisible: false });
    assert.equal(context.cardName, "LADY'S SOLITAIRE CARD");
    assert.equal(context.profileId, 'uob');
  });

  it('findAnyTableBody returns first matching tbody', () => {
    const tbody = { tagName: 'TBODY' };
    globalThis.document.evaluate = (xpath) => ({ singleNodeValue: xpath === '//a' ? null : tbody });
    const match = exports.findAnyTableBody(['//a', '//b']);
    assert.equal(match.xpath, '//b');
    assert.equal(match.tbody, tbody);
  });

  it('getActiveCardName resolves immediately when present', async () => {
    const profile = { cardNameXPaths: ['//path1'] };
    globalThis.document.evaluate = () => ({ singleNodeValue: makeElement("LADY'S SOLITAIRE CARD") });
    globalThis.MutationObserver = class { observe() {} disconnect() {} };
    globalThis.window = { setTimeout: () => 0, clearTimeout: () => {} };

    const match = await exports.getActiveCardName(profile, { waitTimeoutMs: 10 });
    assert.equal(match.name, "LADY'S SOLITAIRE CARD");
  });
});
