import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports } from './helpers/load-userscript-exports.js';
import { snapshotGlobals, restoreGlobals } from './helpers/reset-globals.js';

const exports = await loadExports();

describe('card context helpers (extended)', () => {
  let snapshot;
  beforeEach(() => {
    snapshot = snapshotGlobals();
  });
  afterEach(() => {
    restoreGlobals(snapshot);
  });
  it('isElementVisible checks connection and style', () => {
    globalThis.Element = class {};
    const element = new globalThis.Element();
    element.isConnected = false;
    element.getBoundingClientRect = () => ({ width: 10, height: 10 });
    globalThis.window = { getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }) };
    assert.equal(exports.isElementVisible(element), false);

    element.isConnected = true;
    globalThis.window.getComputedStyle = () => ({ display: 'none', visibility: 'visible', opacity: '1' });
    assert.equal(exports.isElementVisible(element), false);

    globalThis.window.getComputedStyle = () => ({ display: 'block', visibility: 'visible', opacity: '1' });
    element.getBoundingClientRect = () => ({ width: 0, height: 10 });
    assert.equal(exports.isElementVisible(element), false);

    element.getBoundingClientRect = () => ({ width: 10, height: 10 });
    assert.equal(exports.isElementVisible(element), true);
  });

  it('matchesProfile checks host and pathPrefix', () => {
    const profile = { host: 'example.com', pathPrefix: '/cards' };
    globalThis.window = { location: { hostname: 'example.com', pathname: '/cards/view', href: 'https://example.com/cards/view' } };
    assert.equal(exports.matchesProfile(profile), true);

    globalThis.window.location.pathname = '/other';
    assert.equal(exports.matchesProfile(profile), false);
  });

  it('findActiveCardName respects requireVisible option', () => {
    globalThis.window = { getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }) };
    globalThis.Element = class {};
    const visibleNode = new globalThis.Element();
    visibleNode.textContent = "LADY'S SOLITAIRE CARD";
    visibleNode.isConnected = true;
    visibleNode.getBoundingClientRect = () => ({ width: 10, height: 10 });
    globalThis.document.evaluate = () => ({ singleNodeValue: visibleNode });

    const profile = { cardNameXPaths: ['//x'] };
    const match = exports.findActiveCardName(profile, { requireVisible: true });
    assert.equal(match.name, "LADY'S SOLITAIRE CARD");
  });

  it('resolveActiveCardContext builds empty context when match missing', () => {
    globalThis.document.evaluate = () => ({ singleNodeValue: null });
    const profile = { id: 'uob', cardNameXPaths: ['//x'] };
    const context = exports.resolveActiveCardContext(profile, { requireVisible: true });
    assert.equal(context.profileId, 'uob');
    assert.equal(context.cardName, '');
  });

  it('isSupportedCardContext respects allowUnresolved flag', () => {
    const profile = { id: 'uob' };
    const context = { profileId: 'uob', cardName: '' };
    assert.equal(exports.isSupportedCardContext(profile, context, false), false);
    assert.equal(exports.isSupportedCardContext(profile, context, true), true);
  });
});
