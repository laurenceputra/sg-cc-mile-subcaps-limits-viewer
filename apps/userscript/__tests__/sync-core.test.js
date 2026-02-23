import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const USERSCRIPT_PATH = new URL('../bank-cc-limits-subcap-calculator.user.js', import.meta.url);

async function loadExports() {
  const code = await readFile(USERSCRIPT_PATH, 'utf8');
  const sandbox = {
    console,
    URL,
    window: {
      localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
      },
      location: { origin: 'https://pib.uob.com.sg', hostname: 'pib.uob.com.sg' }
    },
    document: {
      head: { appendChild: () => {} },
      createElement: () => ({ setAttribute: () => {}, classList: { add: () => {}, remove: () => {} } })
    },
    crypto: globalThis.crypto,
    TextEncoder,
    TextDecoder,
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    fetch: async () => ({ ok: true, status: 200, statusText: 'OK', text: async () => '' }),
    GM_getValue: undefined,
    GM_setValue: undefined,
    GM_addStyle: undefined,
    GM_xmlhttpRequest: undefined,
    __CC_SUBCAP_TEST__: true
  };

  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'bank-cc-limits-subcap-calculator.user.js' });

  const exports = sandbox.__CC_SUBCAP_TEST_EXPORTS__;
  assert.ok(exports, 'Expected test exports to be registered');
  return exports;
}

function normalizeValue(value) {
  return JSON.parse(JSON.stringify(value));
}

describe('userscript sync core', () => {
  it('parses canonical and legacy payloads', async () => {
    const { parseSyncPayload } = await loadExports();
    const canonical = parseSyncPayload({
      version: 1,
      deviceId: 'device-1',
      timestamp: Date.now(),
      data: { cards: { UOB: { selectedCategories: [] } } }
    });
    assert.equal(canonical.ok, true);
    assert.equal(canonical.format, 'canonical');
    assert.deepEqual(normalizeValue(canonical.normalizedData), { cards: { UOB: { selectedCategories: [] } } });

    const legacyRoot = parseSyncPayload({ cards: { MAYBANK: { selectedCategories: ['Dining'] } } });
    assert.equal(legacyRoot.ok, true);
    assert.equal(legacyRoot.format, 'legacy-cards-root');
    assert.deepEqual(normalizeValue(legacyRoot.normalizedData), { cards: { MAYBANK: { selectedCategories: ['Dining'] } } });

    const invalid = parseSyncPayload({ version: 1, deviceId: 'device-1', data: 'nope' });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.format, 'invalid');
  });

  it('derives sync totals and snapshot defaults', async () => {
    const { calculateMonthlyTotalsForSync, buildSyncCardSnapshot } = await loadExports();
    const transactions = [
      { posting_month: '2024-01', amount_value: 12.5, category: 'Dining' },
      { posting_date_iso: '2024-01-03', amount_value: 5.5 }
    ];
    const totals = calculateMonthlyTotalsForSync(transactions, { defaultCategory: 'Others' });
    assert.deepEqual(normalizeValue(totals), {
      '2024-01': {
        totals: { Dining: 12.5, Others: 5.5 },
        total_amount: 18
      }
    });

    const snapshot = buildSyncCardSnapshot('UOB', { defaultCategory: 'Travel' }, transactions);
    assert.deepEqual(normalizeValue(snapshot.monthlyTotals), {
      '2024-01': {
        totals: { Dining: 12.5, Travel: 5.5 },
        total_amount: 18
      }
    });
    assert.equal(snapshot.defaultCategory, 'Travel');
    assert.deepEqual(normalizeValue(snapshot.selectedCategories), []);
  });

  it('converts errors to sync messages', async () => {
    const { toSyncErrorMessage } = await loadExports();
    const cryptoError = new Error('Operation failed');
    cryptoError.name = 'OperationError';
    assert.equal(
      toSyncErrorMessage(cryptoError),
      'Unable to decrypt synced data. Verify your password and reconnect sync if needed.'
    );

    const payloadError = new Error('Invalid sync payload structure');
    payloadError.name = 'SyncPayloadError';
    assert.equal(
      toSyncErrorMessage(payloadError),
      'Remote sync data format is unsupported or corrupted. Reconnect sync if this persists.'
    );
  });

  it('validates server urls and jwt expiry parsing', async () => {
    const { validateServerUrl, getJwtTokenExpiryMs } = await loadExports();
    assert.throws(() => validateServerUrl(''), /Server URL is required/);
    assert.throws(() => validateServerUrl('ftp://example.com'), /must use HTTP or HTTPS/);
    assert.doesNotThrow(() => validateServerUrl('https://example.com'));

    const nowSeconds = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(JSON.stringify({ exp: nowSeconds + 60 }), 'utf8')
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    const token = `header.${payload}.signature`;
    const expiryMs = getJwtTokenExpiryMs(token);
    assert.ok(typeof expiryMs === 'number');
  });
});
