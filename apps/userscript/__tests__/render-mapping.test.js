// targets: category selector/default category + merchant mapping UI wiring branches.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports } from './helpers/load-userscript-exports.js';
import { snapshotGlobals, restoreGlobals } from './helpers/reset-globals.js';

const exports = await loadExports();

function makeContainer() {
  return { children: [], appendChild(node) { this.children.push(node); } };
}

function makeSelect() {
  return {
    value: '',
    style: {},
    options: [],
    appendChild(option) { this.options.push(option); },
    addEventListener(_evt, handler) { this._handler = handler; },
    trigger() { if (this._handler) this._handler(); }
  };
}

function makeInput() {
  return { value: '', style: {}, placeholder: '', type: 'text' };
}

function makeButton() {
  return { type: 'button', textContent: '', style: {}, addEventListener(_evt, handler) { this._handler = handler; }, click() { if (this._handler) this._handler(); } };
}

describe('render helpers', () => {
  let snapshot;
  beforeEach(() => {
    snapshot = snapshotGlobals();
  });
  afterEach(() => {
    restoreGlobals(snapshot);
  });
  it('renderCategorySelectors updates selectedCategories with dedupe', () => {
    const container = makeContainer();
    const cardSettings = { selectedCategories: ['Dining', 'Travel'], defaultCategory: 'Others' };
    const cardConfig = { subcapSlots: 2, categories: ['Dining', 'Travel', 'Fashion'] };

    const created = [];
    globalThis.document.createElement = (tag) => {
      if (tag === 'select') {
        const select = makeSelect();
        created.push(select);
        return select;
      }
      return { style: {}, appendChild: () => {}, textContent: '' };
    };

    exports.renderCategorySelectors(container, cardSettings, cardConfig, (updater) => updater(cardSettings));
    created[1].value = 'Dining';
    created[1].trigger();
    assert.deepEqual(cardSettings.selectedCategories, ['', 'Dining']);
  });

  it('renderDefaultCategory updates default category', () => {
    const container = makeContainer();
    const cardSettings = { selectedCategories: ['Dining'], defaultCategory: 'Others' };

    globalThis.document.createElement = (tag) => {
      if (tag === 'select') {
        return makeSelect();
      }
      return { style: {}, appendChild: () => {}, textContent: '' };
    };

    exports.renderDefaultCategory(container, cardSettings, (updater) => updater(cardSettings));
    const select = container.children.find((node) => node && node.options);
    select.value = 'Dining';
    select.trigger();
    assert.equal(cardSettings.defaultCategory, 'Dining');
  });

  it('renderMerchantMapping adds wildcard and mass categorizes', () => {
    const container = makeContainer();
    const cardSettings = { defaultCategory: 'Others', merchantMap: {}, transactions: {} };
    const transactions = [
      { merchant_detail: 'STARBUCKS' },
      { merchant_detail: 'GRAB' },
      { merchant_detail: 'GRAB' }
    ];

    const created = { input: null, wildcardSelect: null, addButton: null, massButton: null };
    globalThis.confirm = () => true;
    globalThis.document.createElement = (tag) => {
      if (tag === 'input') {
        created.input = makeInput();
        return created.input;
      }
      if (tag === 'select') {
        if (!created.wildcardSelect) {
          created.wildcardSelect = makeSelect();
          return created.wildcardSelect;
        }
        return makeSelect();
      }
      if (tag === 'button') {
        const button = makeButton();
        if (!created.addButton) {
          created.addButton = button;
        } else if (!created.massButton) {
          created.massButton = button;
        }
        return button;
      }
      return { style: {}, appendChild: () => {}, classList: { add: () => {} }, textContent: '' };
    };

    exports.renderMerchantMapping(container, transactions, cardSettings, (updater) => updater(cardSettings));
    created.input.value = 'STAR*';
    created.wildcardSelect.value = 'Dining';
    created.addButton.click();
    assert.equal(cardSettings.merchantMap['STAR*'], 'Dining');

    assert.notEqual(created.massButton, null, 'mass categorize button should be created');
    created.massButton.click();
    assert.equal(cardSettings.merchantMap.STARBUCKS, 'Others');
    assert.equal(cardSettings.merchantMap.GRAB, 'Others');
  });
});
