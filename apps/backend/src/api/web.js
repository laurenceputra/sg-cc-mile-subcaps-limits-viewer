import { Hono } from 'hono';

const web = new Hono();

const CARD_NAME = "LADY'S SOLITAIRE CARD";
const CAP_POLICY = Object.freeze({
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
const INACTIVITY_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const STORAGE_KEYS = {
  token: 'ccSubcapSyncToken',
  email: 'ccSubcapSyncEmail',
  lastActiveAt: 'ccSubcapSyncLastActiveAt',
  legacyPassphrase: 'ccSubcapSyncPassphrase',
  legacyLastLoginAt: 'ccSubcapSyncLastLoginAt'
};
const VAULT_CONFIG = {
  dbName: 'ccSubcapWebVault',
  storeName: 'syncKeys',
  recordId: 'sync-key-v1'
};

const BASE_STYLES = `
  :root {
    color-scheme: light;
  }
  * {
    box-sizing: border-box;
  }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #f6f6f7;
    color: #1a1a1a;
  }
  .container {
    max-width: 720px;
    margin: 40px auto;
    background: #ffffff;
    padding: 28px;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  }
  h1 {
    margin: 0 0 12px 0;
    font-size: 24px;
  }
  .muted {
    color: #6b6b6b;
    font-size: 14px;
  }
  form {
    margin-top: 20px;
  }
  label {
    display: block;
    margin: 14px 0 6px;
    font-weight: 600;
    font-size: 14px;
  }
  input {
    width: 100%;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid #d0d0d0;
    font-size: 14px;
  }
  button {
    border: none;
    border-radius: 8px;
    padding: 10px 16px;
    font-size: 14px;
    cursor: pointer;
    background: #1b5cff;
    color: #fff;
  }
  button.secondary {
    background: #f1f1f4;
    color: #1a1a1a;
  }
  button:disabled {
    opacity: 0.7;
    cursor: default;
  }
  .actions {
    display: flex;
    gap: 12px;
    margin-top: 18px;
  }
  .status {
    margin-top: 12px;
    font-size: 14px;
  }
  .status.error {
    color: #b00020;
  }
  .status.success {
    color: #0f7d3c;
  }
  .totals {
    margin-top: 20px;
    border-top: 1px solid #ededed;
    padding-top: 16px;
  }
  .totals-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }
  .pill {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 999px;
    background: #f1f1f4;
    font-size: 12px;
  }
  .totals-row {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid #f0f0f0;
    font-size: 14px;
  }
  .totals-row:last-child {
    border-bottom: none;
  }
  .totals-row-value {
    display: inline-flex;
    gap: 8px;
    align-items: center;
  }
  .cap-pill {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 2px 8px;
    border: 1px solid #cbd5e1;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.4;
  }
  .tone-warning {
    font-weight: 600;
  }
  .tone-critical {
    font-weight: 700;
  }
  .card-block {
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 12px;
    margin-bottom: 12px;
    background: #fff;
  }
  .card-title {
    margin: 0 0 8px 0;
    font-size: 16px;
  }
  .month-section {
    border: 1px solid #ededed;
    border-radius: 10px;
    padding: 12px;
    margin-bottom: 12px;
  }
  .month-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  .month-title {
    font-weight: 600;
  }
`;

function createNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function buildCsp(nonce) {
  const cspDirectives = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ];
  return cspDirectives.join('; ');
}

function renderPage({ title, body, script, nonce }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <style>${BASE_STYLES}</style>
  </head>
  <body>
    ${body}
    <script nonce="${nonce}">
      ${script}
    </script>
  </body>
</html>`;
}

function htmlResponse(c, html, nonce) {
  return c.text(html, 200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': buildCsp(nonce)
  });
}

web.get('/login', (c) => {
  const nonce = createNonce();
  const body = `
    <div class="container">
      <h1>Sync Login</h1>
      <p class="muted">Use the same email and password used for userscript sync.</p>
      <form id="login-form">
        <label for="email">Email</label>
        <input id="email" name="email" type="email" autocomplete="username" required>
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required>
        <div class="actions">
          <button id="login-button" type="submit">Login</button>
        </div>
        <div id="status" class="status" role="status" aria-live="polite"></div>
      </form>
    </div>
  `;
  const script = `
    (function() {
      const STORAGE_KEYS = ${JSON.stringify(STORAGE_KEYS)};
      const INACTIVITY_TTL_MS = ${INACTIVITY_TTL_MS};
      const VAULT_CONFIG = ${JSON.stringify(VAULT_CONFIG)};

      function getStorage() {
        try {
          return window.localStorage;
        } catch (error) {
          return window.sessionStorage;
        }
      }

      function readSession(storage) {
        const token = storage.getItem(STORAGE_KEYS.token);
        const email = storage.getItem(STORAGE_KEYS.email);
        const lastActiveAtRaw = storage.getItem(STORAGE_KEYS.lastActiveAt);
        const lastActiveAt = lastActiveAtRaw ? Number(lastActiveAtRaw) : 0;
        return { token, email, lastActiveAt };
      }

      function isSessionActive(lastActiveAt) {
        return Number.isFinite(lastActiveAt) && Date.now() - lastActiveAt < INACTIVITY_TTL_MS;
      }

      function clearSession(storage) {
        Object.values(STORAGE_KEYS).forEach((key) => storage.removeItem(key));
      }

      function setSession(storage, token, email) {
        storage.setItem(STORAGE_KEYS.token, token);
        storage.setItem(STORAGE_KEYS.email, email);
        storage.setItem(STORAGE_KEYS.lastActiveAt, String(Date.now()));
      }

      function isVaultAvailable() {
        return typeof indexedDB !== 'undefined' && Boolean(crypto?.subtle);
      }

      async function openVault() {
        return new Promise((resolve, reject) => {
          const request = indexedDB.open(VAULT_CONFIG.dbName, 1);
          request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(VAULT_CONFIG.storeName)) {
              db.createObjectStore(VAULT_CONFIG.storeName);
            }
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error || new Error('Failed to open vault'));
        });
      }

      async function setVaultRecord(record) {
        if (!isVaultAvailable()) {
          throw new Error('Secure storage is not available');
        }
        const db = await openVault();
        return new Promise((resolve, reject) => {
          const tx = db.transaction(VAULT_CONFIG.storeName, 'readwrite');
          const store = tx.objectStore(VAULT_CONFIG.storeName);
          store.put(record, VAULT_CONFIG.recordId);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error || new Error('Failed to persist secure vault data'));
        });
      }

      async function clearVaultRecord() {
        if (!isVaultAvailable()) {
          return Promise.resolve();
        }
        const db = await openVault();
        return new Promise((resolve, reject) => {
          const tx = db.transaction(VAULT_CONFIG.storeName, 'readwrite');
          const store = tx.objectStore(VAULT_CONFIG.storeName);
          store.delete(VAULT_CONFIG.recordId);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error || new Error('Failed to clear secure vault data'));
        });
      }

      const storage = getStorage();
      const { token, lastActiveAt } = readSession(storage);
      if (token && isSessionActive(lastActiveAt)) {
        window.location.assign('/dashboard');
        return;
      }
      if (token) {
        clearSession(storage);
        clearVaultRecord().catch(() => {});
      }

      const form = document.getElementById('login-form');
      const statusEl = document.getElementById('status');
      const button = document.getElementById('login-button');

      function setStatus(message, type) {
        statusEl.textContent = message || '';
        statusEl.className = 'status' + (type ? ' ' + type : '');
      }

      function setLoading(isLoading) {
        button.disabled = isLoading;
        button.textContent = isLoading ? 'Signing in...' : 'Login';
      }

      function base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
          bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
      }

      async function deriveKey(secret, salt) {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
          'raw',
          enc.encode(secret),
          'PBKDF2',
          false,
          ['deriveKey']
        );
        return crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' },
          keyMaterial,
          { name: 'AES-GCM', length: 256 },
          false,
          ['decrypt']
        );
      }

      async function hashPassphrase(email, passphrase) {
        const enc = new TextEncoder();
        const saltData = enc.encode(email || 'default-salt');
        const saltHash = await crypto.subtle.digest('SHA-256', saltData);
        const salt = new Uint8Array(saltHash).slice(0, 16);
        const keyMaterial = await crypto.subtle.importKey(
          'raw',
          enc.encode(passphrase),
          'PBKDF2',
          false,
          ['deriveBits']
        );
        const derivedBits = await crypto.subtle.deriveBits(
          {
            name: 'PBKDF2',
            salt,
            iterations: 310000,
            hash: 'SHA-256'
          },
          keyMaterial,
          256
        );
        return Array.from(new Uint8Array(derivedBits))
          .map(byte => byte.toString(16).padStart(2, '0'))
          .join('');
      }

      async function persistVaultKey(passphrase, email, token) {
        if (!isVaultAvailable()) {
          throw new Error('Secure storage is not available in this browser');
        }
        const response = await fetch('/sync/data', {
          method: 'GET',
          headers: { Authorization: 'Bearer ' + token },
          credentials: 'same-origin'
        });
        if (!response.ok) {
          return;
        }
        const data = await response.json();
        if (!data || !data.encryptedData || !data.encryptedData.salt) {
          return;
        }
        const key = await deriveKey(passphrase, new Uint8Array(base64ToArrayBuffer(data.encryptedData.salt)));
        await setVaultRecord({
          key,
          salt: data.encryptedData.salt,
          email,
          updatedAt: Date.now()
        });
      }

      async function handleSubmit(event) {
        event.preventDefault();
        setStatus('');

        if (!crypto || !crypto.subtle) {
          setStatus('Secure login is not supported in this browser.', 'error');
          return;
        }

        if (!isVaultAvailable()) {
          setStatus('Secure storage is unavailable; cannot persist session.', 'error');
          return;
        }

        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');
        const email = emailInput.value.trim().toLowerCase();
        let passphrase = passwordInput.value;

        if (!email || !passphrase) {
          setStatus('Email and password are required.', 'error');
          return;
        }

        setLoading(true);

        try {
          const passwordHash = await hashPassphrase(email, passphrase);
          const response = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ email, passwordHash })
          });

          if (!response.ok) {
            setStatus('Login failed. Check your credentials and try again.', 'error');
            return;
          }

          const data = await response.json();
          if (!data || !data.token) {
            setStatus('Login failed. Try again.', 'error');
            return;
          }

          setSession(storage, data.token, email);
          try {
            await persistVaultKey(passphrase, email, data.token);
          } catch (error) {
            setStatus('Login succeeded, but secure key storage failed.', 'error');
            clearSession(storage);
            clearVaultRecord().catch(() => {});
            return;
          } finally {
            passphrase = '';
          }
          window.location.assign('/dashboard');
        } catch (error) {
          setStatus('Login failed. Please retry.', 'error');
        } finally {
          setLoading(false);
        }
      }

      form.addEventListener('submit', handleSubmit);
    })();
  `;

  return htmlResponse(c, renderPage({ title: 'Sync Login', body, script, nonce }), nonce);
});

web.get('/meta/cap-policy', (c) => {
  return c.json(CAP_POLICY);
});

web.get('/dashboard', (c) => {
  const nonce = createNonce();
  const body = `
    <div class="container">
      <h1>Dashboard</h1>
      <p class="muted">Supported cards: ${CARD_NAME}, XL Rewards Card</p>
      <div class="totals">
        <div id="totals-list"></div>
        <div id="empty-state" class="muted"></div>
      </div>
      <div class="actions">
        <button id="refresh-button" type="button">Refresh</button>
        <button id="logout-button" type="button" class="secondary">Logout</button>
      </div>
      <div id="status" class="status" role="status" aria-live="polite"></div>
    </div>
  `;

  const script = `
    (function() {
      const STORAGE_KEYS = ${JSON.stringify(STORAGE_KEYS)};
      const CARD_NAME = ${JSON.stringify(CARD_NAME)};
      const EMBEDDED_CAP_POLICY = ${JSON.stringify(CAP_POLICY)};
      const INACTIVITY_TTL_MS = ${INACTIVITY_TTL_MS};
      const VAULT_CONFIG = ${JSON.stringify(VAULT_CONFIG)};

      function getStorage() {
        try {
          return window.localStorage;
        } catch (error) {
          return window.sessionStorage;
        }
      }

      function readSession(storage) {
        const token = storage.getItem(STORAGE_KEYS.token);
        const email = storage.getItem(STORAGE_KEYS.email);
        const lastActiveAtRaw = storage.getItem(STORAGE_KEYS.lastActiveAt);
        const lastActiveAt = lastActiveAtRaw ? Number(lastActiveAtRaw) : 0;
        return { token, email, lastActiveAt };
      }

      function isSessionActive(lastActiveAt) {
        return Number.isFinite(lastActiveAt) && Date.now() - lastActiveAt < INACTIVITY_TTL_MS;
      }

      function clearSession(storage) {
        Object.values(STORAGE_KEYS).forEach((key) => storage.removeItem(key));
      }

      function markActive(storage) {
        storage.setItem(STORAGE_KEYS.lastActiveAt, String(Date.now()));
      }

      function isVaultAvailable() {
        return typeof indexedDB !== 'undefined' && Boolean(crypto?.subtle);
      }

      async function openVault() {
        return new Promise((resolve, reject) => {
          const request = indexedDB.open(VAULT_CONFIG.dbName, 1);
          request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(VAULT_CONFIG.storeName)) {
              db.createObjectStore(VAULT_CONFIG.storeName);
            }
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error || new Error('Failed to open vault'));
        });
      }

      async function getVaultRecord() {
        if (!isVaultAvailable()) {
          return null;
        }
        const db = await openVault();
        return new Promise((resolve, reject) => {
          const tx = db.transaction(VAULT_CONFIG.storeName, 'readonly');
          const store = tx.objectStore(VAULT_CONFIG.storeName);
          const request = store.get(VAULT_CONFIG.recordId);
          request.onsuccess = () => resolve(request.result || null);
          request.onerror = () => reject(request.error || new Error('Failed to read secure vault data'));
        });
      }

      async function clearVaultRecord() {
        if (!isVaultAvailable()) {
          return Promise.resolve();
        }
        const db = await openVault();
        return new Promise((resolve, reject) => {
          const tx = db.transaction(VAULT_CONFIG.storeName, 'readwrite');
          const store = tx.objectStore(VAULT_CONFIG.storeName);
          store.delete(VAULT_CONFIG.recordId);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error || new Error('Failed to clear secure vault data'));
        });
      }

      const storage = getStorage();
      const session = readSession(storage);
      let token = session.token;
      const email = session.email;

      if (!token || !email || !isSessionActive(session.lastActiveAt)) {
        clearSession(storage);
        clearVaultRecord().catch(() => {});
        window.location.replace('/login');
        return;
      }

      const statusEl = document.getElementById('status');
      const refreshButton = document.getElementById('refresh-button');
      const logoutButton = document.getElementById('logout-button');
      const totalsList = document.getElementById('totals-list');
      const emptyState = document.getElementById('empty-state');

      function setStatus(message, type) {
        statusEl.textContent = message || '';
        statusEl.className = 'status' + (type ? ' ' + type : '');
      }

      function setLoading(isLoading) {
        refreshButton.disabled = isLoading;
        refreshButton.textContent = isLoading ? 'Refreshing...' : 'Refresh';
      }

      function base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
          bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
      }

      async function decryptPayload(key, encryptedData) {
        if (!encryptedData || !encryptedData.ciphertext || !encryptedData.iv || !encryptedData.salt) {
          throw new Error('Missing encrypted data');
        }
        const plaintext = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: base64ToArrayBuffer(encryptedData.iv) },
          key,
          base64ToArrayBuffer(encryptedData.ciphertext)
        );
        return JSON.parse(new TextDecoder().decode(plaintext));
      }

      async function refreshAccessToken() {
        const response = await fetch('/auth/refresh', {
          method: 'POST',
          credentials: 'same-origin'
        });
        if (!response.ok) {
          return false;
        }
        const data = await response.json();
        if (!data || !data.token) {
          return false;
        }
        token = data.token;
        storage.setItem(STORAGE_KEYS.token, token);
        return true;
      }

      async function fetchWithAuth(url) {
        const response = await fetch(url, {
          headers: { Authorization: 'Bearer ' + token },
          credentials: 'same-origin'
        });
        if (response.status !== 401 && response.status !== 403) {
          return response;
        }
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
          return response;
        }
        return fetch(url, {
          headers: { Authorization: 'Bearer ' + token },
          credentials: 'same-origin'
        });
      }

      function isObjectRecord(value) {
        return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
      }

      function looksLikeCardSettings(value) {
        if (!isObjectRecord(value)) return false;
        return (
          Array.isArray(value.selectedCategories) ||
          typeof value.defaultCategory === 'string' ||
          isObjectRecord(value.merchantMap) ||
          isObjectRecord(value.transactions) ||
          isObjectRecord(value.monthlyTotals)
        );
      }

      function parseSyncPayload(payload) {
        if (!isObjectRecord(payload)) {
          return { ok: false };
        }
        if (isObjectRecord(payload.data) && Object.keys(payload.data).length === 0) {
          return { ok: true, normalizedData: { cards: {} } };
        }
        if (isObjectRecord(payload.data) && isObjectRecord(payload.data.cards)) {
          return { ok: true, normalizedData: { cards: payload.data.cards } };
        }
        if (isObjectRecord(payload.cards)) {
          return { ok: true, normalizedData: { cards: payload.cards } };
        }
        const entries = Object.entries(payload);
        if (entries.length && entries.every(([, value]) => looksLikeCardSettings(value))) {
          return { ok: true, normalizedData: { cards: payload } };
        }
        return { ok: false };
      }

      function parseAmount(value) {
        if (typeof value !== 'string') return null;
        const normalized = value.replace(/[^0-9.-]/g, '');
        if (!normalized) return null;
        const amount = Number(normalized);
        return Number.isFinite(amount) ? amount : null;
      }

      function getTransactions(cardSettings) {
        if (!cardSettings || !isObjectRecord(cardSettings.transactions)) {
          return [];
        }
        return Object.values(cardSettings.transactions).map((entry) => {
          const postingDateIso = typeof entry.posting_date_iso === 'string' ? entry.posting_date_iso : '';
          const amountValue =
            typeof entry.amount_value === 'number'
              ? entry.amount_value
              : parseAmount(entry.amount_text || '');
          return {
            ...entry,
            posting_month: entry.posting_month || (postingDateIso ? postingDateIso.slice(0, 7) : ''),
            amount_value: amountValue
          };
        });
      }

      function normalizeMonthlyTotals(monthlyTotals) {
        if (!isObjectRecord(monthlyTotals)) {
          return {};
        }
        const normalized = {};
        Object.entries(monthlyTotals).forEach(([monthKey, monthData]) => {
          if (!isObjectRecord(monthData)) {
            return;
          }
          const totals = isObjectRecord(monthData.totals)
            ? Object.fromEntries(
                Object.entries(monthData.totals)
                  .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
              )
            : {};
          const totalAmount =
            typeof monthData.total_amount === 'number' && Number.isFinite(monthData.total_amount)
              ? monthData.total_amount
              : Object.values(totals).reduce((sum, value) => sum + value, 0);
          normalized[monthKey] = {
            totals,
            total_amount: totalAmount
          };
        });
        return normalized;
      }

      function calculateMonthlyTotals(transactions, cardSettings) {
        const totalsByMonth = {};
        const defaultCategory = cardSettings?.defaultCategory || 'Others';

        transactions.forEach((transaction) => {
          if (!transaction.posting_month) return;
          if (typeof transaction.amount_value !== 'number') return;
          const monthKey = transaction.posting_month;
          if (!totalsByMonth[monthKey]) {
            totalsByMonth[monthKey] = { totals: {}, total_amount: 0 };
          }
          const category = transaction.category || defaultCategory;
          totalsByMonth[monthKey].totals[category] =
            (totalsByMonth[monthKey].totals[category] || 0) + transaction.amount_value;
          totalsByMonth[monthKey].total_amount += transaction.amount_value;
        });

        return totalsByMonth;
      }

      function getMonthlyTotals(cardSettings) {
        if (isObjectRecord(cardSettings?.monthlyTotals)) {
          return normalizeMonthlyTotals(cardSettings.monthlyTotals);
        }
        return calculateMonthlyTotals(getTransactions(cardSettings), cardSettings);
      }

      function formatMonthLabel(monthKey) {
        const match = String(monthKey).match(/^(\\d{4})-(\\d{2})$/);
        if (!match) return monthKey;
        const year = match[1];
        const monthIndex = Number(match[2]) - 1;
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return monthNames[monthIndex] ? monthNames[monthIndex] + ' ' + year : monthKey;
      }

      function normalizeCapPolicy(policy) {
        const fallback = EMBEDDED_CAP_POLICY;
        if (!isObjectRecord(policy)) {
          return fallback;
        }
        const normalized = {
          version: typeof policy.version === 'number' ? policy.version : fallback.version,
          thresholds: {
            warningRatio:
              typeof policy.thresholds?.warningRatio === 'number'
                ? policy.thresholds.warningRatio
                : fallback.thresholds.warningRatio,
            criticalRatio:
              typeof policy.thresholds?.criticalRatio === 'number'
                ? policy.thresholds.criticalRatio
                : fallback.thresholds.criticalRatio
          },
          styles: {
            normal: {
              ...fallback.styles.normal,
              ...(isObjectRecord(policy.styles?.normal) ? policy.styles.normal : {})
            },
            warning: {
              ...fallback.styles.warning,
              ...(isObjectRecord(policy.styles?.warning) ? policy.styles.warning : {})
            },
            critical: {
              ...fallback.styles.critical,
              ...(isObjectRecord(policy.styles?.critical) ? policy.styles.critical : {})
            }
          },
          cards: {}
        };

        const sourceCards = isObjectRecord(policy.cards) ? policy.cards : fallback.cards;
        Object.entries(sourceCards).forEach(([cardName, cardPolicy]) => {
          if (!isObjectRecord(cardPolicy)) {
            return;
          }
          const mode = cardPolicy.mode === 'combined' ? 'combined' : 'per-category';
          const cap = typeof cardPolicy.cap === 'number' && Number.isFinite(cardPolicy.cap) ? cardPolicy.cap : 0;
          normalized.cards[cardName] = { mode, cap };
        });

        if (!Object.keys(normalized.cards).length) {
          normalized.cards = fallback.cards;
        }

        return normalized;
      }

      function getCapSeverity(value, cap, capPolicy) {
        if (typeof value !== 'number' || !Number.isFinite(value) || typeof cap !== 'number' || cap <= 0) {
          return 'normal';
        }
        const ratio = value / cap;
        const warningRatio = capPolicy.thresholds?.warningRatio ?? EMBEDDED_CAP_POLICY.thresholds.warningRatio;
        const criticalRatio = capPolicy.thresholds?.criticalRatio ?? EMBEDDED_CAP_POLICY.thresholds.criticalRatio;
        if (ratio >= criticalRatio) {
          return 'critical';
        }
        if (ratio >= warningRatio) {
          return 'warning';
        }
        return 'normal';
      }

      function applyToneStyle(node, severity, capPolicy, includeBackground = false) {
        const tone = capPolicy.styles?.[severity] || capPolicy.styles?.normal || EMBEDDED_CAP_POLICY.styles.normal;
        node.classList.remove('tone-normal', 'tone-warning', 'tone-critical');
        node.classList.add('tone-' + severity);
        node.style.color = tone.text || EMBEDDED_CAP_POLICY.styles.normal.text;
        if (includeBackground) {
          node.style.background = tone.background || EMBEDDED_CAP_POLICY.styles.normal.background;
          node.style.borderColor = tone.border || EMBEDDED_CAP_POLICY.styles.normal.border;
        }
      }

      async function fetchCapPolicy() {
        try {
          const response = await fetch('/meta/cap-policy', {
            credentials: 'same-origin'
          });
          if (!response.ok) {
            throw new Error('Failed to fetch cap policy');
          }
          const data = await response.json();
          return normalizeCapPolicy(data);
        } catch {
          return normalizeCapPolicy(EMBEDDED_CAP_POLICY);
        }
      }

      function renderTotals(cards, capPolicy) {
        totalsList.innerHTML = '';
        emptyState.textContent = '';
        const cardsRecord = isObjectRecord(cards) ? cards : {};
        const policyCardNames = Object.keys(capPolicy.cards || {});
        const extraCardNames = Object.keys(cardsRecord).filter((cardName) => !policyCardNames.includes(cardName));
        const cardNames = policyCardNames.length ? policyCardNames.concat(extraCardNames) : Object.keys(cardsRecord);

        if (!cardNames.length) {
          emptyState.textContent = 'No synced monthly totals yet.';
          return;
        }

        let renderedCount = 0;
        cardNames.forEach((cardName) => {
          const cardPolicy = capPolicy.cards?.[cardName] || { mode: 'per-category', cap: 0 };
          const cardSettings = cardsRecord[cardName];
          const cardBlock = document.createElement('div');
          cardBlock.className = 'card-block';

          const cardTitle = document.createElement('h2');
          cardTitle.className = 'card-title';
          cardTitle.textContent = cardName;
          cardBlock.appendChild(cardTitle);

          if (!cardSettings) {
            const emptyCard = document.createElement('div');
            emptyCard.className = 'muted';
            emptyCard.textContent = 'No synced totals for this card yet.';
            cardBlock.appendChild(emptyCard);
            totalsList.appendChild(cardBlock);
            return;
          }

          const monthlyTotals = getMonthlyTotals(cardSettings);
          const monthKeys = Object.keys(monthlyTotals).sort((a, b) => b.localeCompare(a)).slice(0, 2);
          if (!monthKeys.length) {
            const emptyCard = document.createElement('div');
            emptyCard.className = 'muted';
            emptyCard.textContent = 'No transactions for this card yet.';
            cardBlock.appendChild(emptyCard);
            totalsList.appendChild(cardBlock);
            return;
          }

          monthKeys.forEach((monthKey) => {
            const monthData = monthlyTotals[monthKey] || { totals: {}, total_amount: 0 };
            const section = document.createElement('div');
            section.className = 'month-section';

            const header = document.createElement('div');
            header.className = 'month-header';
            const title = document.createElement('div');
            title.className = 'month-title';
            title.textContent = formatMonthLabel(monthKey);
            const total = document.createElement('div');
            total.className = 'pill';
            total.textContent = 'Total ' + (monthData.total_amount || 0).toFixed(2);

            if (cardPolicy.mode === 'combined' && cardPolicy.cap > 0) {
              const severity = getCapSeverity(monthData.total_amount || 0, cardPolicy.cap, capPolicy);
              total.classList.add('cap-pill');
              total.textContent = 'Total ' + (monthData.total_amount || 0).toFixed(2) + ' / ' + cardPolicy.cap.toFixed(0);
              applyToneStyle(total, severity, capPolicy, true);
            }

            header.appendChild(title);
            header.appendChild(total);
            section.appendChild(header);

            const entries = Object.entries(monthData.totals || {}).sort((a, b) => b[1] - a[1]);
            if (!entries.length) {
              const empty = document.createElement('div');
              empty.className = 'muted';
              empty.textContent = 'No transactions for this month.';
              section.appendChild(empty);
            } else {
              entries.forEach(([category, value]) => {
                const row = document.createElement('div');
                row.className = 'totals-row';
                const label = document.createElement('span');
                label.textContent = category;
                const valueWrap = document.createElement('span');
                valueWrap.className = 'totals-row-value';
                const amount = document.createElement('span');
                amount.textContent = value.toFixed(2);
                valueWrap.appendChild(amount);

                if (cardPolicy.mode === 'per-category' && cardPolicy.cap > 0) {
                  const severity = getCapSeverity(value, cardPolicy.cap, capPolicy);
                  const capPill = document.createElement('span');
                  capPill.className = 'cap-pill';
                  capPill.textContent = value.toFixed(2) + ' / ' + cardPolicy.cap.toFixed(0);
                  applyToneStyle(amount, severity, capPolicy, false);
                  applyToneStyle(capPill, severity, capPolicy, true);
                  valueWrap.appendChild(capPill);
                }

                row.appendChild(label);
                row.appendChild(valueWrap);
                section.appendChild(row);
              });
            }

            cardBlock.appendChild(section);
          });

          totalsList.appendChild(cardBlock);
          renderedCount += 1;
        });

        if (!renderedCount) {
          emptyState.textContent = 'No synced monthly totals yet.';
        }
      }

      async function handleUnlockRequired(message) {
        setStatus(message, 'error');
        clearSession(storage);
        try {
          await clearVaultRecord();
        } catch (error) {}
        window.location.replace('/login');
      }

      async function loadData() {
        setStatus('');
        setLoading(true);
        emptyState.textContent = '';

        try {
          const lastActiveAtRaw = storage.getItem(STORAGE_KEYS.lastActiveAt);
          const lastActiveAt = lastActiveAtRaw ? Number(lastActiveAtRaw) : 0;
          if (!isSessionActive(lastActiveAt)) {
            await handleUnlockRequired('Session expired. Please log in again.');
            return;
          }

          const response = await fetchWithAuth('/sync/data');

          if (response.status === 401 || response.status === 403) {
            await handleUnlockRequired('Session expired. Please log in again.');
            return;
          }

          if (!response.ok) {
            throw new Error('Failed to fetch');
          }

          const data = await response.json();
          if (!data || !data.encryptedData) {
            totalsList.innerHTML = '';
            emptyState.textContent = 'No synced data available yet.';
            markActive(storage);
            return;
          }

          const vaultRecord = await getVaultRecord();
          if (!vaultRecord || vaultRecord.email !== email) {
            await handleUnlockRequired('Unlock required. Please log in again.');
            return;
          }
          if (vaultRecord.salt !== data.encryptedData.salt) {
            await handleUnlockRequired('Sync key mismatch. Please log in again.');
            return;
          }

          let decrypted;
          try {
            decrypted = await decryptPayload(vaultRecord.key, data.encryptedData);
          } catch (error) {
            await handleUnlockRequired('Unable to decrypt data. Please log in again.');
            return;
          }

          const parsed = parseSyncPayload(decrypted);
          if (!parsed.ok) {
            throw new Error('Invalid sync payload');
          }

          const cards = parsed.normalizedData?.cards || {};
          const capPolicy = await fetchCapPolicy();
          renderTotals(cards, capPolicy);
          markActive(storage);
        } catch (error) {
          setStatus('Unable to load dashboard data. Please retry.', 'error');
        } finally {
          setLoading(false);
        }
      }

      async function handleLogout() {
        setStatus('');
        logoutButton.disabled = true;

        try {
          const response = await fetch('/auth/logout', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token },
            credentials: 'same-origin'
          });

          if (!response.ok) {
            setStatus('Logout failed. Please retry.', 'error');
            return;
          }

          clearSession(storage);
          await clearVaultRecord();
          window.location.assign('/login');
        } catch (error) {
          setStatus('Logout failed. Please retry.', 'error');
        } finally {
          logoutButton.disabled = false;
        }
      }

      refreshButton.addEventListener('click', loadData);
      logoutButton.addEventListener('click', handleLogout);

      loadData();
    })();
  `;

  return htmlResponse(c, renderPage({ title: 'Sync Dashboard', body, script, nonce }), nonce);
});

export default web;
