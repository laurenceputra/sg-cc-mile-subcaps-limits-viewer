/**
 * UI/card parity tests — pure logic only, no DOM rendering.
 * Validates that cap policy, severity thresholds, card-specific config,
 * and category ordering behave consistently for both UOB and Maybank cards.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports } from './helpers/load-userscript-exports.js';

describe('UI card parity (logic layer)', () => {
  // ── EMBEDDED_CAP_POLICY shape ─────────────────────────────────────────────

  describe('EMBEDDED_CAP_POLICY', () => {
    it('defines both UOB and Maybank cards', async () => {
      const { EMBEDDED_CAP_POLICY } = await loadExports();
      assert.ok(Object.prototype.hasOwnProperty.call(EMBEDDED_CAP_POLICY.cards, "LADY'S SOLITAIRE CARD"));
      assert.ok(Object.prototype.hasOwnProperty.call(EMBEDDED_CAP_POLICY.cards, 'XL Rewards Card'));
    });

    it('UOB uses per-category mode with 750 cap', async () => {
      const { EMBEDDED_CAP_POLICY } = await loadExports();
      const uob = EMBEDDED_CAP_POLICY.cards["LADY'S SOLITAIRE CARD"];
      assert.equal(uob.mode, 'per-category');
      assert.equal(uob.cap, 750);
    });

    it('Maybank uses combined mode with 1000 cap', async () => {
      const { EMBEDDED_CAP_POLICY } = await loadExports();
      const maybank = EMBEDDED_CAP_POLICY.cards['XL Rewards Card'];
      assert.equal(maybank.mode, 'combined');
      assert.equal(maybank.cap, 1000);
    });
  });

  // ── normalizeCapPolicy ────────────────────────────────────────────────────

  describe('normalizeCapPolicy: UOB card', () => {
    it('returns per-category mode and 750 cap for UOB', async () => {
      const { normalizeCapPolicy } = await loadExports();
      const policy = normalizeCapPolicy({
        version: 1,
        cards: { "LADY'S SOLITAIRE CARD": { mode: 'per-category', cap: 750 } }
      });
      assert.equal(policy.cards["LADY'S SOLITAIRE CARD"].mode, 'per-category');
      assert.equal(policy.cards["LADY'S SOLITAIRE CARD"].cap, 750);
    });
  });

  describe('normalizeCapPolicy: Maybank card', () => {
    it('returns combined mode and 1000 cap for Maybank', async () => {
      const { normalizeCapPolicy } = await loadExports();
      const policy = normalizeCapPolicy({
        version: 1,
        cards: { 'XL Rewards Card': { mode: 'combined', cap: 1000 } }
      });
      assert.equal(policy.cards['XL Rewards Card'].mode, 'combined');
      assert.equal(policy.cards['XL Rewards Card'].cap, 1000);
    });
  });

  // ── getCardCapPolicy ──────────────────────────────────────────────────────

  describe('getCardCapPolicy', () => {
    it('returns UOB policy from embedded default', async () => {
      const { getCardCapPolicy } = await loadExports();
      const policy = getCardCapPolicy("LADY'S SOLITAIRE CARD");
      assert.equal(policy.mode, 'per-category');
      assert.equal(policy.cap, 750);
    });

    it('returns Maybank policy from embedded default', async () => {
      const { getCardCapPolicy } = await loadExports();
      const policy = getCardCapPolicy('XL Rewards Card');
      assert.equal(policy.mode, 'combined');
      assert.equal(policy.cap, 1000);
    });

    it('returns fallback for unknown card', async () => {
      const { getCardCapPolicy } = await loadExports();
      const policy = getCardCapPolicy('Unknown Card');
      assert.equal(policy.mode, 'per-category');
      assert.equal(policy.cap, 0);
    });
  });

  // ── getCapSeverity: threshold behavior ───────────────────────────────────

  describe('getCapSeverity thresholds (UOB cap=750)', () => {
    it('normal at 0% spend', async () => {
      const { getCapSeverity } = await loadExports();
      assert.equal(getCapSeverity(0, 750), 'normal');
    });

    it('normal below warning threshold (~93%)', async () => {
      const { getCapSeverity } = await loadExports();
      // 699/750 ≈ 93.2% — just below warningRatio (0.9333...)
      assert.equal(getCapSeverity(699, 750), 'normal');
    });

    it('warning at exactly 700/750 (≈93.33%)', async () => {
      const { getCapSeverity } = await loadExports();
      // 700/750 = 0.9333... matches warningRatio exactly
      assert.equal(getCapSeverity(700, 750), 'warning');
    });

    it('warning between 93.33% and 100%', async () => {
      const { getCapSeverity } = await loadExports();
      assert.equal(getCapSeverity(749, 750), 'warning');
    });

    it('critical at exactly 100%', async () => {
      const { getCapSeverity } = await loadExports();
      assert.equal(getCapSeverity(750, 750), 'critical');
    });

    it('critical above 100%', async () => {
      const { getCapSeverity } = await loadExports();
      assert.equal(getCapSeverity(800, 750), 'critical');
    });
  });

  describe('getCapSeverity thresholds (Maybank combined cap=1000)', () => {
    it('normal at 0% spend', async () => {
      const { getCapSeverity } = await loadExports();
      assert.equal(getCapSeverity(0, 1000), 'normal');
    });

    it('warning near 93.33% of 1000', async () => {
      const { getCapSeverity } = await loadExports();
      // 934/1000 > 0.9333
      assert.equal(getCapSeverity(934, 1000), 'warning');
    });

    it('critical at 100% of 1000', async () => {
      const { getCapSeverity } = await loadExports();
      assert.equal(getCapSeverity(1000, 1000), 'critical');
    });
  });

  // ── getCategoryDisplayOrder: Others always last ──────────────────────────

  describe('getCategoryDisplayOrder: Others always last', () => {
    it('UOB: Others is last with standard selected categories', async () => {
      const { getCategoryDisplayOrder } = await loadExports();
      const settings = { selectedCategories: ['Dining', 'Travel', 'Fashion'] };
      const order = getCategoryDisplayOrder(settings, []);
      assert.equal(order[order.length - 1], 'Others');
    });

    it('Maybank: Others is last even with Local/Forex categories', async () => {
      const { getCategoryDisplayOrder } = await loadExports();
      const settings = { selectedCategories: ['Local', 'Forex'] };
      const order = getCategoryDisplayOrder(settings, []);
      assert.equal(order[order.length - 1], 'Others');
    });

    it('Others is last even when it is first in selectedCategories', async () => {
      const { getCategoryDisplayOrder } = await loadExports();
      const settings = { selectedCategories: ['Others', 'Dining'] };
      const order = getCategoryDisplayOrder(settings, []);
      assert.equal(order[order.length - 1], 'Others');
      assert.ok(order.indexOf('Dining') < order.indexOf('Others'));
    });

    it('extra available categories appear before Others', async () => {
      const { getCategoryDisplayOrder } = await loadExports();
      const settings = { selectedCategories: ['Dining'] };
      const order = getCategoryDisplayOrder(settings, ['Beauty & Wellness', 'Family']);
      assert.ok(order.indexOf('Beauty & Wellness') < order.indexOf('Others'));
      assert.ok(order.indexOf('Family') < order.indexOf('Others'));
    });
  });

  // ── CARD_CONFIGS shape ────────────────────────────────────────────────────

  describe('CARD_CONFIGS', () => {
    it('defines categories for UOB Lady\'s Solitaire Card', async () => {
      const { CARD_CONFIGS } = await loadExports();
      const config = CARD_CONFIGS["LADY'S SOLITAIRE CARD"];
      assert.ok(Array.isArray(config.categories));
      assert.ok(config.categories.includes('Dining'));
      assert.ok(config.categories.includes('Travel'));
      assert.equal(config.subcapSlots, 2);
      assert.equal(config.showManageTab, true);
    });

    it('defines categories for Maybank XL Rewards Card', async () => {
      const { CARD_CONFIGS } = await loadExports();
      const config = CARD_CONFIGS['XL Rewards Card'];
      assert.ok(Array.isArray(config.categories));
      assert.ok(config.categories.includes('Local'));
      assert.ok(config.categories.includes('Forex'));
      assert.equal(config.subcapSlots, 2);
      assert.equal(config.showManageTab, false);
    });
  });
});
