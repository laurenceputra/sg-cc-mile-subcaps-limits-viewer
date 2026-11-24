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

// Synthetic portal fixture: the selected label and inactive menu are separate.
const MAYBANK_ACTIVE_LABEL_XPATH = '//*[contains(concat(" ", normalize-space(@class), " "), " nameDetails ") and contains(concat(" ", normalize-space(@class), " "), " cards ")]/span[contains(concat(" ", normalize-space(@class), " "), " selected-accountname ")]';

function setupMaybankCardFixture(activeName) {
  const profile = exports.PORTAL_PROFILES.find(({ id }) => id === 'maybank2u-sg');
  const label = Object.assign(new Element(), makeElement(activeName));
  const menu = makeElement('XL Rewards Card');
  const page = makeElement(`${activeName} ${menu.textContent} Status: ready`);
  // Model the current scoped selector and the old ancestor-text fallback.
  // Positional paths have no match in this synthetic layout.
  globalThis.document.evaluate = (xpath) => ({
    singleNodeValue: xpath === MAYBANK_ACTIVE_LABEL_XPATH
      ? label
      : (xpath.startsWith('//*[contains(translate(') ? page : null)
  });
  return { profile, label, menu, page };
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

  it('findActiveCardName does not fallback when strict primary xpath is non-matching', () => {
    const profile = {
      cardNameXPaths: ['//primary', '//fallback'],
      strictPrimaryCardNameXPath: true
    };
    const nodes = {
      '//primary': makeElement('Maybank Family Card'),
      '//fallback': makeElement('XL Rewards Card')
    };
    globalThis.document.evaluate = (xpath) => ({ singleNodeValue: nodes[xpath] || null });
    const match = exports.findActiveCardName(profile, { requireVisible: false });
    assert.equal(match, null);
  });

  it('Maybank keeps the same click context when unrelated page and menu text changes', async () => {
    const { profile, page, menu } = setupMaybankCardFixture('XL Rewards Card');
    const options = { requireVisible: profile.requireVisibleCardName === true };
    const initialContext = exports.resolveActiveCardContext(profile, options);
    assert.equal(initialContext.cardName, 'XL Rewards Card');
    assert.equal(initialContext.rawCardName, 'XL Rewards Card');
    assert.equal(initialContext.cardNameXPath, MAYBANK_ACTIVE_LABEL_XPATH);

    menu.textContent = 'XL Rewards Card Another Card';
    page.textContent = `XL Rewards Card ${menu.textContent} Status: updated Spend Totals`;
    // The button click resolves through getActiveCardName before comparing contexts.
    const clickMatch = await exports.getActiveCardName(profile, options);
    const clickContext = exports.buildCardContext(profile, clickMatch);
    assert.equal(exports.isSameCardContextPair(initialContext, clickContext), true);
    assert.equal(clickContext.rawCardName, 'XL Rewards Card');
  });

  it('Maybank rejects an unsupported active card even with XL in the menu and page', () => {
    const { profile, menu } = setupMaybankCardFixture('Unsupported Card');
    const options = { requireVisible: profile.requireVisibleCardName === true };
    assert.equal(menu.textContent, 'XL Rewards Card');
    assert.equal(exports.findActiveCardName(profile, options), null);
    const context = exports.resolveActiveCardContext(profile, options);
    assert.equal(context.cardName, '');
    assert.equal(exports.isSupportedCardContext(profile, context), false);
  });

  it('Maybank does not use menu text when the active label is hidden or missing', () => {
    const { profile, label } = setupMaybankCardFixture('XL Rewards Card');
    const options = { requireVisible: profile.requireVisibleCardName === true };
    label.getBoundingClientRect = () => ({ width: 0, height: 0 });
    assert.equal(exports.findActiveCardName(profile, options), null);
    label.getBoundingClientRect = () => ({ width: 10, height: 10 });
    label.isConnected = false;
    assert.equal(exports.findActiveCardName(profile, options), null);
    globalThis.document.evaluate = () => ({ singleNodeValue: null });
    assert.equal(exports.findActiveCardName(profile, options), null);
  });

  it('matchesProfile checks host and path', () => {
    globalThis.window = {
      location: { hostname: 'pib.uob.com.sg', href: 'https://pib.uob.com.sg/accountsDashboard', pathname: '/accountsDashboard' }
    };
    const profile = { host: 'pib.uob.com.sg', pathPrefix: '/accountsDashboard' };
    assert.equal(exports.matchesProfile(profile), true);
    const bad = { host: 'example.com', pathPrefix: '/accountsDashboard' };
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
