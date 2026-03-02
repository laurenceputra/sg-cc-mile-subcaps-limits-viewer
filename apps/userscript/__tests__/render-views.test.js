// targets: renderSummary/renderManageView/renderSpendingView to cover UI branches.
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports } from './helpers/load-userscript-exports.js';
import { snapshotGlobals, restoreGlobals } from './helpers/reset-globals.js';

const exports = await loadExports();
const globalsSnapshot = snapshotGlobals();

afterEach(() => {
  restoreGlobals(globalsSnapshot);
});

function makeClassList() {
  const set = new Set();
  return {
    add: (...names) => names.forEach((name) => set.add(name)),
    contains: (name) => set.has(name)
  };
}

function makeContainer() {
  return {
    children: [],
    innerHTML: '',
    classList: makeClassList(),
    appendChild(node) { this.children.push(node); return node; }
  };
}

function makeElement(tag = 'div') {
  const element = {
    tagName: tag,
    textContent: '',
    innerHTML: '',
    style: {},
    classList: makeClassList(),
    children: [],
    appendChild(node) { this.children.push(node); return node; },
    setAttribute: () => {},
    addEventListener: () => {}
  };
  if (tag === 'select') {
    element.value = '';
  }
  return element;
}

function collectText(node, bucket) {
  if (!node) {
    return;
  }
  if (typeof node.textContent === 'string' && node.textContent) {
    bucket.push(node.textContent);
  }
  if (Array.isArray(node.children)) {
    node.children.forEach((child) => collectText(child, bucket));
  }
}

describe('rendered views', () => {
  it('renderSummary renders totals and issues', () => {
    const container = makeContainer();
    const cardSettings = { defaultCategory: 'Others' };
    const data = {
      summary: { totals: { Dining: 10 }, total_amount: 10 },
      diagnostics: { invalid_posting_date: 1 }
    };
    globalThis.document.createElement = (tag) => makeElement(tag);
    exports.renderSummary(container, data, cardSettings);
    const texts = [];
    container.children.forEach((child) => collectText(child, texts));
    const joined = texts.join(' ');
    assert.match(joined, /Totals in Statement Month/, 'summary should show totals heading');
    assert.match(joined, /Dining/, 'summary should list Dining category');
    assert.match(joined, /10\.00/, 'summary should show formatted amount');
    assert.match(joined, /Total/, 'summary should show Total label');
  });

  it('renderManageView composes sections and mapping', () => {
    const container = makeContainer();
    const data = { summary: { totals: {}, total_amount: 0 }, diagnostics: {} };
    const cardSettings = { defaultCategory: 'Others', selectedCategories: ['Dining', ''], merchantMap: {}, transactions: {} };
    const cardConfig = { subcapSlots: 2, categories: ['Dining', 'Travel'] };
    globalThis.document.createElement = (tag) => makeElement(tag);
    exports.renderManageView(container, data, [], cardSettings, cardConfig, (updater) => updater(cardSettings));
    const ids = container.children.map((child) => child.id).filter(Boolean);
    const notice = container.children.find((child) => child.classList.contains('cc-subcap-notice'));
    assert.equal(ids.includes('cc-subcap-summary'), true, 'manage view should contain summary section');
    assert.notEqual(notice, undefined, 'manage view should contain a notice element');
  });

  it('renderSpendingView handles empty and populated months', () => {
    const container = makeContainer();
    const cardSettings = { defaultCategory: 'Others' };
    globalThis.document.createElement = (tag) => makeElement(tag);
    exports.renderSpendingView(container, [], cardSettings, "LADY'S SOLITAIRE CARD");
    const emptyTexts = [];
    container.children.forEach((child) => collectText(child, emptyTexts));
    assert.match(emptyTexts.join(' '), /No stored transactions yet/, 'empty state should show no-transactions message');

    const stored = [
      { posting_month: '2024-01', category: 'Dining', amount_value: 10 },
      { posting_month: '2024-01', category: 'Travel', amount_value: 5 }
    ];
    const container2 = makeContainer();
    exports.renderSpendingView(container2, stored, cardSettings, "LADY'S SOLITAIRE CARD");
    const filledTexts = [];
    container2.children.forEach((child) => collectText(child, filledTexts));
    const filledJoined = filledTexts.join(' ');
    assert.match(filledJoined, /Spend Totals/, 'populated view should show spend totals heading');
    assert.match(filledJoined, /Total 15\.00/, 'populated view should show combined total');
  });
});
