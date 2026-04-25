export const CARD_NAME = "LADY'S SOLITAIRE CARD";

export const CAP_POLICY = Object.freeze({
  version: 1,
  thresholds: {
    warningRatio: 0.9333333333,
    criticalRatio: 1
  },
  styles: {
    normal: { background: '#f1f5f9', border: '#cbd5e1', text: '#334155' },
    warning: { background: '#fef3c7', border: '#f59e0b', text: '#92400e' },
    critical: { background: '#fee2e2', border: '#ef4444', text: '#991b1b' }
  },
  cards: {
    "LADY'S SOLITAIRE CARD": {
      mode: 'per-category',
      cap: 750
    },
    'XL Rewards Card': {
      mode: 'combined',
      cap: 1000
    }
  }
});

export const INACTIVITY_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const STORAGE_KEYS = {
  token: 'ccSubcapSyncToken',
  email: 'ccSubcapSyncEmail',
  lastActiveAt: 'ccSubcapSyncLastActiveAt',
  legacyPassphrase: 'ccSubcapSyncPassphrase',
  legacyLastLoginAt: 'ccSubcapSyncLastLoginAt'
};

export const VAULT_CONFIG = {
  dbName: 'ccSubcapWebVault',
  storeName: 'syncKeys',
  recordId: 'sync-key-v1'
};
