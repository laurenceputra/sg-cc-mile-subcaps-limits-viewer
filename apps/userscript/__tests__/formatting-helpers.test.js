// targets: formatting/date helpers and cap tone styling branches.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports } from './helpers/load-userscript-exports.js';

const exports = await loadExports();

describe('formatting helpers', () => {
  it('formatMonthLabel formats valid month keys', () => {
    assert.equal(exports.formatMonthLabel('2024-01'), 'Jan 2024');
    assert.equal(exports.formatMonthLabel('2024-12'), 'Dec 2024');
    assert.equal(exports.formatMonthLabel('bad'), 'bad');
  });

  it('parsePostingDate parses and rejects invalid dates', () => {
    const parsed = exports.parsePostingDate('01 Jan 2024');
    assert.equal(parsed instanceof Date, true, 'valid date string should return a Date instance');
    assert.equal(parsed.getFullYear(), 2024, 'parsed year should be 2024');
    assert.equal(exports.parsePostingDate('01 Foo 2024'), null);
  });

  it('toISODate/fromISODate round trip', () => {
    const date = new Date(2024, 0, 1);
    const iso = exports.toISODate(date);
    assert.equal(iso, '2024-01-01');
    const parsed = exports.fromISODate(iso);
    assert.equal(parsed instanceof Date, true, 'fromISODate should return a Date instance');
    assert.equal(parsed.getFullYear(), 2024, 'round-tripped year should be 2024');
  });

  it('normalizeKey and normalizeRefNo clean input', () => {
    assert.equal(exports.normalizeKey('  Hello  '), 'Hello');
    assert.equal(exports.normalizeRefNo('Ref No: 123'), '123');
    assert.equal(exports.normalizeRefNo(''), '');
  });

  it('extractDollarsAndCents handles missing spans', () => {
    const cell = { textContent: '12.50', querySelector: () => null };
    const result = exports.extractDollarsAndCents(cell);
    assert.equal(result.amountText, '12.50');
  });

  it('applyCapToneStyles uses fallback tone and background', () => {
    const element = { style: {} };
    const policy = {
      thresholds: {},
      styles: {
        normal: { text: '#111', background: '#fff', border: '#ccc' }
      }
    };
    exports.applyCapToneStyles(element, 'normal', policy, true);
    assert.equal(element.style.color, '#111');
    assert.equal(element.style.background, '#fff');
    assert.equal(element.style.borderColor, '#ccc');
  });
});
