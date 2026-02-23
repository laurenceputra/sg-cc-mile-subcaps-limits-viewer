/**
 * SPA observer regression tests.
 * Focuses on card name resolution and context identity logic —
 * the parts that are most fragile to SPA navigation changes.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports } from './helpers/load-userscript-exports.js';

describe('SPA observers and card context helpers', () => {
  // ── resolveSupportedCardName ──────────────────────────────────────────────

  describe('resolveSupportedCardName', () => {
    it('returns empty string for null/empty input', async () => {
      const { resolveSupportedCardName } = await loadExports();
      assert.equal(resolveSupportedCardName(''), '');
      assert.equal(resolveSupportedCardName(null), '');
      assert.equal(resolveSupportedCardName(undefined), '');
    });

    it('returns exact key on exact match', async () => {
      const { resolveSupportedCardName } = await loadExports();
      assert.equal(resolveSupportedCardName("LADY'S SOLITAIRE CARD"), "LADY'S SOLITAIRE CARD");
      assert.equal(resolveSupportedCardName('XL Rewards Card'), 'XL Rewards Card');
    });

    it('resolves case-insensitive exact match', async () => {
      const { resolveSupportedCardName } = await loadExports();
      assert.equal(resolveSupportedCardName("lady's solitaire card"), "LADY'S SOLITAIRE CARD");
      assert.equal(resolveSupportedCardName("LADY'S SOLITAIRE CARD"), "LADY'S SOLITAIRE CARD");
    });

    it('resolves XL Rewards from various patterns', async () => {
      const { resolveSupportedCardName } = await loadExports();
      assert.equal(resolveSupportedCardName('XL REWARDS CARD'), 'XL Rewards Card');
      assert.equal(resolveSupportedCardName('xl rewards card'), 'XL Rewards Card');
      assert.equal(resolveSupportedCardName('My XL Rewards Card (Main)'), 'XL Rewards Card');
      // XL Rewards special path (word-boundary match)
      assert.equal(resolveSupportedCardName('SOME XL REWARDS ACCOUNT'), 'XL Rewards Card');
    });

    it('returns empty string for completely unknown card name', async () => {
      const { resolveSupportedCardName } = await loadExports();
      assert.equal(resolveSupportedCardName('VISA INFINITE'), '');
      assert.equal(resolveSupportedCardName('RANDOM BANK CARD'), '');
    });

    it('partial substring match resolves correctly', async () => {
      const { resolveSupportedCardName } = await loadExports();
      // "XL Rewards Card" is a substring of this
      assert.equal(resolveSupportedCardName('Maybank XL Rewards Card Premium'), 'XL Rewards Card');
    });

    it('handles whitespace padding gracefully', async () => {
      const { resolveSupportedCardName } = await loadExports();
      assert.equal(resolveSupportedCardName('  XL Rewards Card  '), 'XL Rewards Card');
    });
  });

  // ── isSameCardContextPair ─────────────────────────────────────────────────

  describe('isSameCardContextPair', () => {
    it('returns true for identical context objects', async () => {
      const { isSameCardContextPair } = await loadExports();
      const ctx = {
        profileId: 'uob-pib',
        cardName: "LADY'S SOLITAIRE CARD",
        rawCardName: "LADY'S SOLITAIRE CARD",
        cardNameXPath: '/html/body/div[1]'
      };
      assert.equal(isSameCardContextPair(ctx, { ...ctx }), true);
    });

    it('returns false when profileId differs', async () => {
      const { isSameCardContextPair } = await loadExports();
      const base = { profileId: 'uob-pib', cardName: 'X', rawCardName: 'X', cardNameXPath: '/a' };
      assert.equal(isSameCardContextPair(base, { ...base, profileId: 'maybank' }), false);
    });

    it('returns false when cardName differs', async () => {
      const { isSameCardContextPair } = await loadExports();
      const base = { profileId: 'uob-pib', cardName: 'X', rawCardName: 'X', cardNameXPath: '/a' };
      assert.equal(isSameCardContextPair(base, { ...base, cardName: 'Y' }), false);
    });

    it('returns false when rawCardName differs', async () => {
      const { isSameCardContextPair } = await loadExports();
      const base = { profileId: 'p', cardName: 'X', rawCardName: 'X raw', cardNameXPath: '/a' };
      assert.equal(isSameCardContextPair(base, { ...base, rawCardName: 'X raw 2' }), false);
    });

    it('returns false when cardNameXPath differs', async () => {
      const { isSameCardContextPair } = await loadExports();
      const base = { profileId: 'p', cardName: 'X', rawCardName: 'X', cardNameXPath: '/a' };
      assert.equal(isSameCardContextPair(base, { ...base, cardNameXPath: '/b' }), false);
    });

    it('returns false for null or non-object inputs', async () => {
      const { isSameCardContextPair } = await loadExports();
      const ctx = { profileId: 'p', cardName: 'X', rawCardName: 'X', cardNameXPath: '/a' };
      assert.equal(isSameCardContextPair(null, ctx), false);
      assert.equal(isSameCardContextPair(ctx, null), false);
      assert.equal(isSameCardContextPair(null, null), false);
      assert.equal(isSameCardContextPair('string', ctx), false);
    });
  });

  // ── Rapid card-switch scenario ────────────────────────────────────────────

  describe('rapid card-switch context stability', () => {
    it('two successive context pairs with different cardName are never identical', async () => {
      const { isSameCardContextPair } = await loadExports();
      const first = {
        profileId: 'uob-pib',
        cardName: "LADY'S SOLITAIRE CARD",
        rawCardName: "LADY'S SOLITAIRE CARD",
        cardNameXPath: '/xpath/1'
      };
      const second = {
        profileId: 'uob-pib',
        cardName: 'XL Rewards Card',
        rawCardName: 'XL Rewards Card',
        cardNameXPath: '/xpath/1'
      };
      assert.equal(isSameCardContextPair(first, second), false);
    });

    it('same card after navigation is considered identical context', async () => {
      const { isSameCardContextPair } = await loadExports();
      const ctx = {
        profileId: 'uob-pib',
        cardName: "LADY'S SOLITAIRE CARD",
        rawCardName: "LADY'S SOLITAIRE CARD",
        cardNameXPath: '/xpath/1'
      };
      // Simulates SPA navigation back to same card — should be treated as same
      assert.equal(isSameCardContextPair(ctx, { ...ctx }), true);
    });
  });

  // ── resolveSupportedCardName edge cases ───────────────────────────────────

  describe('resolveSupportedCardName: stale/garbled text edge cases', () => {
    it('returns empty string for numeric-only input', async () => {
      const { resolveSupportedCardName } = await loadExports();
      assert.equal(resolveSupportedCardName('1234567890'), '');
    });

    it('returns empty string for special chars only', async () => {
      const { resolveSupportedCardName } = await loadExports();
      assert.equal(resolveSupportedCardName('!@#$%^&*()'), '');
    });

    it('does not match partial known card name when no substring/word boundary', async () => {
      const { resolveSupportedCardName } = await loadExports();
      // 'REWARDS' alone should not match 'XL Rewards Card'
      assert.equal(resolveSupportedCardName('REWARDS'), '');
    });
  });
});
