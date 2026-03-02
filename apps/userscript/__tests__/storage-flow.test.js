// targets: storage normalization, cutoff filtering, overlay/tab paths.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports } from './helpers/load-userscript-exports.js';
import { snapshotGlobals, restoreGlobals } from './helpers/reset-globals.js';

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
    replaceWith: function (node) { children.push(node); return node; },
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
  const body = makeElement('body');
  const documentStub = {
    head: { appendChild: () => {} },
    body,
    documentElement: {},
    createElement: (tag) => makeElement(tag),
    getElementById: (id) => elementsById.get(id) || null,
    evaluate: () => ({ singleNodeValue: null })
  };
  return { documentStub, elementsById };
}

describe('storage flows', () => {
  let snapshot;
  beforeEach(() => {
    snapshot = snapshotGlobals();
  });
  afterEach(() => {
    restoreGlobals(snapshot);
  });
  it('ensureCardSettings normalizes defaults and selection count', () => {
    const settings = { cards: {} };
    const cardConfig = { subcapSlots: 2, categories: ['Dining', 'Travel'] };
    const cardSettings = exports.ensureCardSettings(settings, 'UOB', cardConfig);
    assert.equal(cardSettings.selectedCategories.length, 2);
    assert.equal(cardSettings.defaultCategory, 'Others');

    cardSettings.selectedCategories = ['Dining', 'Dining'];
    cardSettings.defaultCategory = 'Invalid';
    exports.ensureCardSettings(settings, 'UOB', cardConfig);
    assert.equal(cardSettings.defaultCategory, 'Others');
  });

  it('updateStoredTransactions keeps only in-cutoff entries', () => {
    const settings = { cards: {} };
    const cardConfig = { subcapSlots: 1, categories: ['Dining'] };
    const cardSettings = exports.ensureCardSettings(settings, 'UOB', cardConfig);

    const now = new Date();
    const recentDate = new Date(now.getFullYear(), now.getMonth(), 5);
    const oldDate = new Date(now.getFullYear(), now.getMonth() - 6, 1);

    cardSettings.transactions = {
      old: {
        ref_no: 'OLD',
        posting_date: '01 Jan 2020',
        posting_date_iso: exports.toISODate(oldDate),
        amount_value: 1,
        category: 'Dining'
      }
    };

    const txs = [
      { ref_no: 'NEW', posting_date: '01 Feb 2024', posting_date_iso: exports.toISODate(recentDate), amount_value: 12, category: 'Dining' },
      { ref_no: '', posting_date: '01 Feb 2024', posting_date_iso: exports.toISODate(recentDate), amount_value: 1, category: 'Dining' }
    ];

    exports.updateStoredTransactions(settings, 'UOB', cardConfig, txs);
    const stored = settings.cards.UOB.transactions;
    assert.equal(Object.keys(stored).length, 1);
    assert.notEqual(stored.NEW, undefined, 'recent transaction NEW should be kept');
  });

  it('getStoredTransactions normalizes and dedupes by newer date', () => {
    const cardSettings = {
      defaultCategory: 'Others',
      merchantMap: {},
      transactions: {
        'ref-1': {
          ref_no: 'REF-1',
          merchant_detail: 'Shop',
          posting_date_iso: '2024-01-01',
          amount_text: '10.00'
        },
        'ref-1-dup': {
          ref_no: 'REF-1',
          merchant_detail: 'Shop',
          posting_date_iso: '2024-02-01',
          amount_text: '12.00'
        }
      }
    };

    const list = exports.getStoredTransactions('UOB', cardSettings);
    assert.equal(list.length, 1);
    assert.equal(list[0].posting_date_iso, '2024-02-01');
    assert.equal(list[0].amount_value, 12);
  });

  it('createOverlay wires tabs and sync section replacement', () => {
    const { documentStub, elementsById } = stubDocument();
    globalThis.document = documentStub;
    globalThis.window = { location: { href: 'https://pib.uob.com.sg' } };

    documentStub.createElement = (tag) => {
      const node = makeElement(tag);
      node._queryMap = { '#setup-sync-btn': makeElement('button') };
      return node;
    };

    const overlay = makeElement('div');
    overlay.id = 'cc-subcap-overlay';
    overlay.classList.add('cc-subcap-hidden');
    const manage = makeElement('div');
    manage.id = 'cc-subcap-manage';
    const spend = makeElement('div');
    spend.id = 'cc-subcap-spend';
    const sync = makeElement('div');
    sync.id = 'cc-subcap-sync';

    const tabManage = makeElement('button');
    tabManage.id = 'cc-subcap-tab-manage';
    const tabSpend = makeElement('button');
    tabSpend.id = 'cc-subcap-tab-spend';
    const tabSync = makeElement('button');
    tabSync.id = 'cc-subcap-tab-sync';

    elementsById.set(overlay.id, overlay);
    elementsById.set(manage.id, manage);
    elementsById.set(spend.id, spend);
    elementsById.set(sync.id, sync);
    elementsById.set(tabManage.id, tabManage);
    elementsById.set(tabSpend.id, tabSpend);
    elementsById.set(tabSync.id, tabSync);

    const cardConfig = { showManageTab: true, subcapSlots: 1, categories: ['Dining'] };
    const cardSettings = { defaultCategory: 'Others', selectedCategories: ['Dining'], merchantMap: {}, transactions: {} };
    const data = { summary: { totals: {}, total_amount: 0 }, diagnostics: {} };

    exports.createOverlay(data, {}, [], 'UOB', cardConfig, cardSettings, () => {}, true, exports.EMBEDDED_CAP_POLICY);
    exports.switchTab('sync');

    assert.equal(tabSync.classList.contains('cc-subcap-tab-button-active'), true);
  });
});
