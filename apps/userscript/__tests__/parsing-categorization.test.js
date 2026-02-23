import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports } from './helpers/load-userscript-exports.js';

describe('parsing and categorization helpers', () => {
  // ── hasUnescapedWildcard ─────────────────────────────────────────────────

  describe('hasUnescapedWildcard', () => {
    it('returns true for pattern with bare asterisk', async () => {
      const { hasUnescapedWildcard } = await loadExports();
      assert.equal(hasUnescapedWildcard('GRAB*'), true);
      assert.equal(hasUnescapedWildcard('*COFFEE*'), true);
      assert.equal(hasUnescapedWildcard('*'), true);
    });

    it('returns false for pattern with no asterisk', async () => {
      const { hasUnescapedWildcard } = await loadExports();
      assert.equal(hasUnescapedWildcard('STARBUCKS'), false);
      assert.equal(hasUnescapedWildcard(''), false);
    });

    it('returns false when asterisk is escaped', async () => {
      const { hasUnescapedWildcard } = await loadExports();
      assert.equal(hasUnescapedWildcard('GRAB\\*'), false);
    });

    it('returns true when escaped backslash is followed by asterisk', async () => {
      const { hasUnescapedWildcard } = await loadExports();
      // "\\*" means literal backslash then literal asterisk -> asterisk is not escaped
      assert.equal(hasUnescapedWildcard('GRAB\\\\*'), true);
    });

    it('returns false for non-string input', async () => {
      const { hasUnescapedWildcard } = await loadExports();
      assert.equal(hasUnescapedWildcard(null), false);
      assert.equal(hasUnescapedWildcard(undefined), false);
      assert.equal(hasUnescapedWildcard(42), false);
    });
  });

  // ── buildWildcardRegex ───────────────────────────────────────────────────

  describe('buildWildcardRegex', () => {
    it('builds case-insensitive regex anchored at both ends', async () => {
      const { buildWildcardRegex } = await loadExports();
      const re = buildWildcardRegex('GRAB*');
      assert.ok(re instanceof RegExp);
      assert.ok(re.flags.includes('i'));
      assert.ok(re.test('GRAB TRANSPORT'));
      assert.ok(re.test('grab transport'));
      assert.ok(!re.test('COFFEE'));
    });

    it('wildcard does not match literal asterisk', async () => {
      const { buildWildcardRegex } = await loadExports();
      const re = buildWildcardRegex('A*B');
      assert.ok(!re.test('A*B'));
      assert.ok(re.test('AXXXB'));
      assert.ok(re.test('AB'));
    });

    it('escaped asterisk matches literal asterisk', async () => {
      const { buildWildcardRegex } = await loadExports();
      const re = buildWildcardRegex('GRAB\\*FOOD');
      assert.ok(re.test('GRAB*FOOD'));
      assert.ok(!re.test('GRABFOOD'));
    });

    it('special regex chars in pattern are escaped', async () => {
      const { buildWildcardRegex } = await loadExports();
      const re = buildWildcardRegex('A.B*');
      assert.ok(re.test('A.BXYZ'));
      assert.ok(!re.test('AXBXYZ'));
    });
  });

  // ── matchesWildcard ──────────────────────────────────────────────────────

  describe('matchesWildcard', () => {
    it('matches merchant using wildcard pattern', async () => {
      const { matchesWildcard } = await loadExports();
      assert.equal(matchesWildcard('GRAB TRANSPORT', 'GRAB*'), true);
      assert.equal(matchesWildcard('grab food delivery', 'grab*'), true);
    });

    it('returns false for pattern without wildcard', async () => {
      const { matchesWildcard } = await loadExports();
      assert.equal(matchesWildcard('STARBUCKS', 'STARBUCKS'), false);
    });

    it('returns false for non-string inputs', async () => {
      const { matchesWildcard } = await loadExports();
      assert.equal(matchesWildcard(null, 'GRAB*'), false);
      assert.equal(matchesWildcard('GRAB', null), false);
      assert.equal(matchesWildcard(undefined, undefined), false);
    });

    it('mid-string wildcard matches correctly', async () => {
      const { matchesWildcard } = await loadExports();
      assert.equal(matchesWildcard('SUPER COFFEE PTE LTD', '*COFFEE*'), true);
      assert.equal(matchesWildcard('TEA HOUSE', '*COFFEE*'), false);
    });
  });

  // ── resolveCategory ──────────────────────────────────────────────────────

  describe('resolveCategory', () => {
    it('returns default category for empty merchant name', async () => {
      const { resolveCategory } = await loadExports();
      const settings = { defaultCategory: 'Dining' };
      assert.equal(resolveCategory('', settings), 'Dining');
      assert.equal(resolveCategory(null, settings), 'Dining');
    });

    it('falls back to Others when no default set and merchant missing', async () => {
      const { resolveCategory } = await loadExports();
      assert.equal(resolveCategory('', {}), 'Others');
    });

    it('exact merchantMap match wins', async () => {
      const { resolveCategory } = await loadExports();
      const settings = {
        defaultCategory: 'Others',
        merchantMap: { STARBUCKS: 'Coffee', 'GRAB*': 'Transport' }
      };
      assert.equal(resolveCategory('STARBUCKS', settings), 'Coffee');
    });

    it('case-insensitive exact match wins over wildcard', async () => {
      const { resolveCategory } = await loadExports();
      const settings = {
        defaultCategory: 'Others',
        merchantMap: { starbucks: 'Coffee', 'STAR*': 'Unknown' }
      };
      assert.equal(resolveCategory('STARBUCKS', settings), 'Coffee');
    });

    it('wildcard match is used when no exact match', async () => {
      const { resolveCategory } = await loadExports();
      const settings = {
        defaultCategory: 'Others',
        merchantMap: { 'GRAB*': 'Transport' }
      };
      assert.equal(resolveCategory('GRAB FOOD', settings), 'Transport');
    });

    it('first matching wildcard pattern wins (insertion order)', async () => {
      const { resolveCategory } = await loadExports();
      const settings = {
        defaultCategory: 'Others',
        merchantMap: { 'GRAB*': 'Transport', '*FOOD*': 'Dining' }
      };
      assert.equal(resolveCategory('GRAB FOOD DELIVERY', settings), 'Transport');
    });

    it('XL Rewards Card auto-categorizes SGP as Local', async () => {
      const { resolveCategory } = await loadExports();
      assert.equal(resolveCategory('GRAB TRANSPORT SGP', {}, 'XL Rewards Card'), 'Local');
      assert.equal(resolveCategory('AIRBNB', {}, 'XL Rewards Card'), 'Forex');
    });

    it('XL Rewards Card merchantMap takes precedence over auto-categorize', async () => {
      const { resolveCategory } = await loadExports();
      const settings = { merchantMap: { 'GRAB TRANSPORT SGP': 'Dining' } };
      assert.equal(resolveCategory('GRAB TRANSPORT SGP', settings, 'XL Rewards Card'), 'Dining');
    });

    it('returns default category when no map and no card-specific rule', async () => {
      const { resolveCategory } = await loadExports();
      const settings = { defaultCategory: 'Fashion' };
      assert.equal(resolveCategory('RANDOM MERCHANT', settings, "LADY'S SOLITAIRE CARD"), 'Fashion');
    });
  });

  // ── parseAmount ──────────────────────────────────────────────────────────

  describe('parseAmount', () => {
    it('parses plain numeric strings', async () => {
      const { parseAmount } = await loadExports();
      assert.equal(parseAmount('12.50'), 12.5);
      assert.equal(parseAmount('100'), 100);
      assert.equal(parseAmount('0.99'), 0.99);
    });

    it('strips non-numeric characters', async () => {
      const { parseAmount } = await loadExports();
      assert.equal(parseAmount('SGD 12.50'), 12.5);
      assert.equal(parseAmount('$100.00'), 100);
      assert.equal(parseAmount('-15.00'), -15);
    });

    it('returns null for empty or whitespace input', async () => {
      const { parseAmount } = await loadExports();
      assert.equal(parseAmount(''), null);
      assert.equal(parseAmount(null), null);
      assert.equal(parseAmount(undefined), null);
    });

    it('returns null when stripped value is non-numeric', async () => {
      const { parseAmount } = await loadExports();
      assert.equal(parseAmount('SGD'), null);
      assert.equal(parseAmount('N/A'), null);
    });
  });

  // ── normalizeCapPolicy ───────────────────────────────────────────────────

  describe('normalizeCapPolicy', () => {
    it('returns embedded policy for null/non-object input', async () => {
      const { normalizeCapPolicy, EMBEDDED_CAP_POLICY } = await loadExports();
      const result = normalizeCapPolicy(null);
      assert.equal(result.version, EMBEDDED_CAP_POLICY.version);
      assert.deepEqual(result.cards, EMBEDDED_CAP_POLICY.cards);
    });

    it('normalizes a valid custom policy', async () => {
      const { normalizeCapPolicy } = await loadExports();
      const custom = {
        version: 2,
        thresholds: { warningRatio: 0.8, criticalRatio: 1.0 },
        cards: { "LADY'S SOLITAIRE CARD": { mode: 'per-category', cap: 500 } }
      };
      const result = normalizeCapPolicy(custom);
      assert.equal(result.version, 2);
      assert.equal(result.thresholds.warningRatio, 0.8);
      assert.equal(result.cards["LADY'S SOLITAIRE CARD"].cap, 500);
    });

    it('falls back to per-category mode when mode is unrecognized', async () => {
      const { normalizeCapPolicy } = await loadExports();
      const custom = {
        cards: { MyCard: { mode: 'unknown', cap: 300 } }
      };
      const result = normalizeCapPolicy(custom);
      assert.equal(result.cards.MyCard.mode, 'per-category');
    });

    it('falls back to embedded cards when cards object is empty', async () => {
      const { normalizeCapPolicy, EMBEDDED_CAP_POLICY } = await loadExports();
      const result = normalizeCapPolicy({ cards: {} });
      assert.deepEqual(result.cards, EMBEDDED_CAP_POLICY.cards);
    });

    it('uses fallback thresholds for missing threshold fields', async () => {
      const { normalizeCapPolicy, EMBEDDED_CAP_POLICY } = await loadExports();
      const result = normalizeCapPolicy({ thresholds: {} });
      assert.equal(result.thresholds.warningRatio, EMBEDDED_CAP_POLICY.thresholds.warningRatio);
      assert.equal(result.thresholds.criticalRatio, EMBEDDED_CAP_POLICY.thresholds.criticalRatio);
    });
  });

  // ── getCapSeverity ───────────────────────────────────────────────────────

  describe('getCapSeverity', () => {
    it('returns normal for value well below warning threshold', async () => {
      const { getCapSeverity } = await loadExports();
      assert.equal(getCapSeverity(100, 750), 'normal');
      assert.equal(getCapSeverity(0, 750), 'normal');
    });

    it('returns warning when ratio >= warningRatio (0.9333...)', async () => {
      const { getCapSeverity } = await loadExports();
      // 700/750 = 0.9333... exactly hits warning threshold
      assert.equal(getCapSeverity(700, 750), 'warning');
      assert.equal(getCapSeverity(710, 750), 'warning');
    });

    it('returns critical when ratio >= criticalRatio (1.0)', async () => {
      const { getCapSeverity } = await loadExports();
      assert.equal(getCapSeverity(750, 750), 'critical');
      assert.equal(getCapSeverity(800, 750), 'critical');
    });

    it('returns normal for invalid inputs', async () => {
      const { getCapSeverity } = await loadExports();
      assert.equal(getCapSeverity('foo', 750), 'normal');
      assert.equal(getCapSeverity(100, 0), 'normal');
      assert.equal(getCapSeverity(NaN, 750), 'normal');
      assert.equal(getCapSeverity(100, -1), 'normal');
    });
  });

  // ── getCategoryDisplayOrder ──────────────────────────────────────────────

  describe('getCategoryDisplayOrder', () => {
    it('places Others last when not in selected', async () => {
      const { getCategoryDisplayOrder } = await loadExports();
      const settings = { selectedCategories: ['Dining', 'Travel'] };
      const order = getCategoryDisplayOrder(settings, []);
      assert.equal(order[order.length - 1], 'Others');
    });

    it('Others stays last even when explicitly in selected', async () => {
      const { getCategoryDisplayOrder } = await loadExports();
      const settings = { selectedCategories: ['Others', 'Dining'] };
      const order = getCategoryDisplayOrder(settings, []);
      assert.equal(order[order.length - 1], 'Others');
    });

    it('extra available categories appear before Others', async () => {
      const { getCategoryDisplayOrder } = await loadExports();
      const settings = { selectedCategories: ['Dining'] };
      const order = getCategoryDisplayOrder(settings, ['Fashion', 'Travel']);
      assert.ok(order.indexOf('Fashion') < order.indexOf('Others'));
      assert.ok(order.indexOf('Travel') < order.indexOf('Others'));
    });

    it('deduplicates categories', async () => {
      const { getCategoryDisplayOrder } = await loadExports();
      const settings = { selectedCategories: ['Dining', 'Dining'] };
      const order = getCategoryDisplayOrder(settings, ['Dining']);
      assert.equal(order.filter((c) => c === 'Dining').length, 1);
    });
  });
});
