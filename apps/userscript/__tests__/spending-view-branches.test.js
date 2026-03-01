// targets: renderSpendingView branches (cap badges, details tables).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports } from './helpers/load-userscript-exports.js';

const exports = await loadExports();

function makeElement(tag = 'div') {
  return {
    tagName: tag,
    children: [],
    classList: {
      add: () => {},
      toggle: () => {}
    },
    style: {},
    textContent: '',
    appendChild(node) {
      this.children.push(node);
      return node;
    },
    setAttribute: () => {}
  };
}

function makeContainer() {
  return {
    children: [],
    innerHTML: '',
    classList: { add: () => {} },
    appendChild(node) { this.children.push(node); return node; }
  };
}

function collectText(node, sink = []) {
  if (!node) {
    return sink;
  }
  if (typeof node.textContent === 'string' && node.textContent) {
    sink.push(node.textContent);
  }
  if (Array.isArray(node.children)) {
    node.children.forEach((child) => collectText(child, sink));
  }
  return sink;
}

describe('renderSpendingView branches', () => {
  it('renders combined cap badge with total/cap text', () => {
    globalThis.document.createElement = (tag) => makeElement(tag);

    const container = makeContainer();
    const cardSettings = { defaultCategory: 'Others' };
    const stored = [
      { posting_month: '2024-02', category: 'Dining', amount_value: 600, merchant_detail: 'A', posting_date: '01 Feb 2024' },
      { posting_month: '2024-02', category: 'Travel', amount_value: 450, merchant_detail: 'B', posting_date: '02 Feb 2024' }
    ];
    const policy = {
      version: 1,
      thresholds: { warningRatio: 0.8, criticalRatio: 1.0 },
      styles: {
        normal: { background: '#fff', border: '#ccc', text: '#111' },
        warning: { background: '#fff2cc', border: '#f90', text: '#333' },
        critical: { background: '#fee', border: '#f00', text: '#900' }
      },
      cards: { 'XL Rewards Card': { mode: 'combined', cap: 1000 } }
    };

    exports.renderSpendingView(container, stored, cardSettings, 'XL Rewards Card', policy);
    const texts = collectText(container);
    const combinedCapText = texts.find((text) => text.includes('Total') && text.includes('1000'));
    assert.notEqual(combinedCapText, undefined, 'should render combined cap badge with total/cap text');
    assert.match(combinedCapText, /1050\.00 \/ 1000/, 'cap badge should show 1050.00 / 1000');
  });

  it('renders per-category cap text and details table headers', () => {
    globalThis.document.createElement = (tag) => makeElement(tag);

    const container = makeContainer();
    const cardSettings = { defaultCategory: 'Others', selectedCategories: ['Dining'] };
    const stored = [
      { posting_month: '2024-01', category: 'Dining', amount_value: 500, merchant_detail: 'Coffee', posting_date: '01 Jan 2024' },
      { posting_month: '2024-01', category: 'Others', amount_value: 20, merchant_detail: 'Misc', posting_date: '02 Jan 2024' }
    ];
    const policy = {
      version: 1,
      thresholds: { warningRatio: 0.8, criticalRatio: 1.0 },
      styles: {
        normal: { background: '#fff', border: '#ccc', text: '#111' },
        warning: { background: '#fff2cc', border: '#f90', text: '#333' },
        critical: { background: '#fee', border: '#f00', text: '#900' }
      },
      cards: { "LADY'S SOLITAIRE CARD": { mode: 'per-category', cap: 750 } }
    };

    exports.renderSpendingView(container, stored, cardSettings, "LADY'S SOLITAIRE CARD", policy);
    const texts = collectText(container);
    const capText = texts.find((text) => text.includes('500.00') && text.includes('750'));
    assert.notEqual(capText, undefined, 'should render per-category cap text');
    assert.equal(texts.includes('Merchant'), true, 'details table should have Merchant header');
    assert.equal(texts.includes('Posting Date'), true, 'details table should have Posting Date header');
    assert.equal(texts.includes('Amount'), true, 'details table should have Amount header');
  });

  it('createSpendDetailsToggle builds details/summary', () => {
    globalThis.document.createElement = (tag) => makeElement(tag);
    const details = exports.createSpendDetailsToggle();
    const texts = collectText(details);
    assert.equal(texts.includes('View transactions'), true, 'details toggle should show View transactions text');
  });
});
