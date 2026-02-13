// ==UserScript==
// @name         Bank CC Limits Subcap Calculator
// @namespace    local
// @version      0.7.0
// @description  Extract credit card transactions and manage subcap categories with optional sync
// @author       laurenceputra
// @downloadURL  https://raw.githubusercontent.com/laurenceputra/sg-cc-mile-subcaps-limits-viewer/main/apps/userscript/bank-cc-limits-subcap-calculator.user.js
// @updateURL    https://raw.githubusercontent.com/laurenceputra/sg-cc-mile-subcaps-limits-viewer/main/apps/userscript/bank-cc-limits-subcap-calculator.user.js
// @match        https://pib.uob.com.sg/PIBCust/2FA/processSubmit.do*
// @match        https://cib.maybank2u.com.sg/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      bank-cc-sync.laurenceputra.workers.dev
// @connect      laurenceputra.workers.dev
// @connect      localhost
// ==/UserScript==

(function () {
  'use strict';

  class StorageAdapter {
    constructor() {
      this.useGM = typeof GM_getValue === 'function' && typeof GM_setValue === 'function';
    }

    get(key, fallback = null) {
      try {
        if (this.useGM) {
          return GM_getValue(key, fallback);
        }
      } catch (error) {
        console.error('[Storage] GM_getValue error:', error);
      }
      const stored = window.localStorage.getItem(key);
      return stored !== null ? stored : fallback;
    }

    set(key, value) {
      try {
        if (this.useGM) {
          GM_setValue(key, value);
          return;
        }
      } catch (error) {
        console.error('[Storage] GM_setValue error:', error);
      }
      window.localStorage.setItem(key, value);
    }

    remove(key) {
      try {
        if (this.useGM && typeof GM_deleteValue === 'function') {
          GM_deleteValue(key);
          return;
        }
      } catch (error) {
        console.error('[Storage] GM_deleteValue error:', error);
      }
      window.localStorage.removeItem(key);
    }
  }

  class ApiClient {
    constructor(baseUrl) {
      this.baseUrl = baseUrl;
      this.token = null;
    }

    setToken(token) {
      this.token = token;
    }

    async requestWithFetch(url, config) {
      const response = await fetch(url, config);
      const text = await response.text();
      let data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (error) {
          data = null;
        }
      }
      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        data
      };
    }

    async requestWithGM(url, config) {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: config.method || 'GET',
          url,
          headers: config.headers || {},
          data: config.body,
          responseType: 'text',
          timeout: 30000,
          onload: (response) => {
            let data = null;
            if (response.responseText) {
              try {
                data = JSON.parse(response.responseText);
              } catch (error) {
                data = null;
              }
            }
            resolve({
              ok: response.status >= 200 && response.status < 300,
              status: response.status,
              statusText: response.statusText || '',
              data
            });
          },
          onerror: () => {
            reject(new Error('Network request failed'));
          },
          ontimeout: () => {
            reject(new Error('Network request timed out'));
          }
        });
      });
    }

    async request(endpoint, options = {}) {
      const url = `${this.baseUrl}${endpoint}`;
      const isGMTransport = typeof GM_xmlhttpRequest === 'function';
      const transportMode = isGMTransport ? 'gm_xmlhttpRequest' : 'fetch';
      const pageOrigin = typeof window?.location?.origin === 'string' ? window.location.origin : 'unknown';
      const headers = {
        'Content-Type': 'application/json',
        ...options.headers
      };

      if (this.token) {
        headers.Authorization = `Bearer ${this.token}`;
      }

      if (isGMTransport) {
        headers['X-CC-Userscript'] = 'tampermonkey-v1';
      }

      const config = {
        ...options,
        headers
      };

      try {
        const response =
          isGMTransport
            ? await this.requestWithGM(url, config)
            : await this.requestWithFetch(url, config);

        if (!response.ok) {
          const errorMessage = response.data?.message || response.statusText || `HTTP ${response.status}`;
          if (endpoint.startsWith('/auth/')) {
            console.warn('[ApiClient] Auth request failed:', {
              endpoint,
              status: response.status,
              transport: transportMode,
              pageOrigin
            });
          }
          throw new Error(errorMessage);
        }

        return response.data;
      } catch (error) {
        if (endpoint.startsWith('/auth/')) {
          console.warn('[ApiClient] Auth transport diagnostics:', {
            endpoint,
            transport: transportMode,
            pageOrigin
          });
        }
        console.error('[ApiClient] Request failed:', error);
        throw error;
      }
    }

    async login(email, passwordHash) {
      const response = await this.request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, passwordHash })
      });
      this.setToken(response.token);
      return response;
    }

    async register(email, passwordHash, tier = 'free') {
      const response = await this.request('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, passwordHash, tier })
      });
      this.setToken(response.token);
      return response;
    }

    async getSyncData() {
      return this.request('/sync/data');
    }

    async putSyncData(encryptedData, version) {
      return this.request('/sync/data', {
        method: 'PUT',
        body: JSON.stringify({ encryptedData, version })
      });
    }

    async getSharedMappings(cardType) {
      return this.request(`/shared/mappings/${encodeURIComponent(cardType)}`);
    }

    async contributeMappings(mappings) {
      return this.request('/shared/mappings/contribute', {
        method: 'POST',
        body: JSON.stringify({ mappings })
      });
    }

    async deleteUserData() {
      return this.request('/user/data', {
        method: 'DELETE'
      });
    }
  }

  function isObjectRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  function hasValidTimestamp(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
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

  function getPayloadTopLevelKeys(payload, maxKeys = 8) {
    if (!isObjectRecord(payload)) return [];
    return Object.keys(payload).slice(0, maxKeys);
  }

  function parseSyncPayload(payload) {
    const invalid = (reason) => ({
      ok: false,
      format: 'invalid',
      reason,
      normalizedData: null,
      timestamp: 0
    });

    if (!isObjectRecord(payload)) {
      return invalid('payload_not_object');
    }

    const hasVersionField = Object.prototype.hasOwnProperty.call(payload, 'version');
    const hasDeviceIdField = Object.prototype.hasOwnProperty.call(payload, 'deviceId');
    const hasTimestampField = Object.prototype.hasOwnProperty.call(payload, 'timestamp');
    const hasDataField = Object.prototype.hasOwnProperty.call(payload, 'data');
    const hasCanonicalEnvelopeFields =
      hasVersionField &&
      hasDeviceIdField &&
      hasTimestampField &&
      hasDataField;

    if (hasCanonicalEnvelopeFields) {
      if (typeof payload.version !== 'number' || !Number.isFinite(payload.version) || payload.version < 0) {
        return invalid('invalid_version');
      }
      if (typeof payload.deviceId !== 'string' || !payload.deviceId) {
        return invalid('invalid_device_id');
      }
      if (!hasValidTimestamp(payload.timestamp)) {
        return invalid('invalid_timestamp');
      }
      if (!isObjectRecord(payload.data)) {
        return invalid('invalid_data_object');
      }
      if (!Object.prototype.hasOwnProperty.call(payload.data, 'cards') && Object.keys(payload.data).length === 0) {
        return {
          ok: true,
          format: 'legacy-empty-data-root',
          reason: null,
          normalizedData: { cards: {} },
          timestamp: payload.timestamp
        };
      }
      if (!isObjectRecord(payload.data.cards)) {
        return invalid('invalid_cards_object');
      }

      return {
        ok: true,
        format: 'canonical',
        reason: null,
        normalizedData: { cards: payload.data.cards },
        timestamp: payload.timestamp
      };
    }

    if (isObjectRecord(payload.cards)) {
      return {
        ok: true,
        format: 'legacy-cards-root',
        reason: null,
        normalizedData: { cards: payload.cards },
        timestamp: hasValidTimestamp(payload.timestamp) ? payload.timestamp : Date.now()
      };
    }

    if (isObjectRecord(payload.data) && isObjectRecord(payload.data.cards)) {
      return {
        ok: true,
        format: 'legacy-data-root',
        reason: null,
        normalizedData: { cards: payload.data.cards },
        timestamp: hasValidTimestamp(payload.timestamp) ? payload.timestamp : Date.now()
      };
    }

    const entries = Object.entries(payload);
    if (entries.length === 0) {
      return invalid('empty_payload');
    }

    const allEntriesAreObjects = entries.every(([, value]) => isObjectRecord(value));
    const hasCardSettingsShape = entries.some(([, value]) => looksLikeCardSettings(value));

    if (allEntriesAreObjects && hasCardSettingsShape) {
      return {
        ok: true,
        format: 'legacy-card-map-root',
        reason: null,
        normalizedData: { cards: payload },
        timestamp: Date.now()
      };
    }

    if (hasVersionField || hasDeviceIdField) {
      return invalid('partial_canonical_envelope');
    }

    return invalid('unrecognized_payload_shape');
  }

  function validateServerUrl(url) {
    if (!url || typeof url !== 'string') {
      throw new Error('Server URL is required');
    }

    let parsed;
    try {
      parsed = new URL(url);
    } catch (error) {
      throw new Error('Invalid URL format');
    }

    const allowedProtocols = ['http:', 'https:'];
    if (!allowedProtocols.includes(parsed.protocol)) {
      throw new Error('Server URL must use HTTP or HTTPS protocol');
    }
  }

  function toSyncErrorMessage(error, fallback = 'Unknown sync error') {
    const message = typeof error?.message === 'string' ? error.message : '';
    const isPayloadStructureError =
      error?.name === 'SyncPayloadError' ||
      /invalid sync payload structure/i.test(message);
    const isCryptoOperationError =
      error?.name === 'OperationError' ||
      /operation-specific reason/i.test(message) ||
      /operation failed/i.test(message);

    if (isPayloadStructureError) {
      return 'Remote sync data format is unsupported or corrupted. Reconnect sync if this persists.';
    }

    if (isCryptoOperationError) {
      return 'Unable to decrypt synced data. Verify your password and reconnect sync if needed.';
    }

    return message || fallback;
  }

  class SyncEngine {
    constructor(apiClient, cryptoManager, storage) {
      this.api = apiClient;
      this.crypto = cryptoManager;
      this.storage = storage;
    }

    async pull() {
      try {
        const response = await this.api.getSyncData();

        if (!response || !response.encryptedData) {
          return { success: true, data: null, version: 0 };
        }

        const decrypted = await this.crypto.decrypt(
          response.encryptedData.ciphertext,
          response.encryptedData.iv,
          response.encryptedData.salt
        );

        const parsedPayload = parseSyncPayload(decrypted);

        if (!parsedPayload.ok) {
          console.warn('[SyncEngine] Invalid sync payload metadata:', {
            format: parsedPayload.format,
            reason: parsedPayload.reason,
            keys: getPayloadTopLevelKeys(decrypted)
          });
          const payloadError = new Error(`Invalid sync payload structure (${parsedPayload.reason})`);
          payloadError.name = 'SyncPayloadError';
          throw payloadError;
        }

        if (parsedPayload.format !== 'canonical') {
          console.info('[SyncEngine] Migrating legacy sync payload format:', parsedPayload.format);
        }

        return {
          success: true,
          data: parsedPayload.normalizedData,
          version: response.version,
          timestamp: parsedPayload.timestamp
        };
      } catch (error) {
        console.error('[SyncEngine] Pull failed:', error);
        return { success: false, error: toSyncErrorMessage(error, 'Failed to pull sync data') };
      }
    }

    async push(data, version, deviceId) {
      try {
        const payload = {
          version: version + 1,
          deviceId,
          timestamp: Date.now(),
          data
        };

        const encrypted = await this.crypto.encrypt(payload);
        const response = await this.api.putSyncData(encrypted, payload.version);

        return {
          success: true,
          version: response.version
        };
      } catch (error) {
        console.error('[SyncEngine] Push failed:', error);
        return { success: false, error: toSyncErrorMessage(error, 'Failed to push sync data') };
      }
    }

    mergeCardSettings(base, incoming) {
      if (!base) return incoming;
      if (!incoming) return base;

      const merged = { ...base, ...incoming };
      merged.merchantMap = { ...(base.merchantMap || {}), ...(incoming.merchantMap || {}) };
      merged.monthlyTotals = { ...(base.monthlyTotals || {}), ...(incoming.monthlyTotals || {}) };

      if (Array.isArray(incoming.selectedCategories)) {
        merged.selectedCategories = incoming.selectedCategories.slice();
      }
      if (typeof incoming.defaultCategory === 'string' && incoming.defaultCategory) {
        merged.defaultCategory = incoming.defaultCategory;
      }

      return merged;
    }

    sanitizeCardSettings(cardSettings) {
      if (!isObjectRecord(cardSettings)) {
        return null;
      }

      const selectedCategories = Array.isArray(cardSettings.selectedCategories)
        ? cardSettings.selectedCategories.map((value) => (typeof value === 'string' ? value : ''))
        : [];
      const defaultCategory =
        typeof cardSettings.defaultCategory === 'string' && cardSettings.defaultCategory
          ? cardSettings.defaultCategory
          : 'Others';
      const merchantMap = isObjectRecord(cardSettings.merchantMap)
        ? Object.fromEntries(
            Object.entries(cardSettings.merchantMap).filter(
              ([merchant, category]) => typeof merchant === 'string' && typeof category === 'string'
            )
          )
        : {};
      const monthlyTotals = isObjectRecord(cardSettings.monthlyTotals)
        ? Object.fromEntries(
            Object.entries(cardSettings.monthlyTotals).map(([monthKey, monthData]) => {
              const totals = isObjectRecord(monthData?.totals)
                ? Object.fromEntries(
                    Object.entries(monthData.totals)
                      .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
                  )
                : {};
              const totalAmount =
                typeof monthData?.total_amount === 'number' && Number.isFinite(monthData.total_amount)
                  ? monthData.total_amount
                  : Object.values(totals).reduce((sum, value) => sum + value, 0);
              return [monthKey, { totals, total_amount: totalAmount }];
            })
          )
        : {};

      return {
        selectedCategories,
        defaultCategory,
        merchantMap,
        monthlyTotals
      };
    }

    sanitizeDataForSync(data) {
      const inputCards = isObjectRecord(data?.cards) ? data.cards : {};
      const sanitizedCards = {};
      for (const [cardName, cardSettings] of Object.entries(inputCards)) {
        const sanitized = this.sanitizeCardSettings(cardSettings);
        if (sanitized) {
          sanitizedCards[cardName] = sanitized;
        }
      }
      return { cards: sanitizedCards };
    }

    async sync(localData, currentVersion, deviceId) {
      const pullResult = await this.pull();

      if (!pullResult.success) {
        return pullResult;
      }

      const remoteCards = isObjectRecord(pullResult.data?.cards) ? pullResult.data.cards : {};
      const localCards = isObjectRecord(localData?.cards) ? localData.cards : {};
      const mergedCards = { ...remoteCards };

      for (const [cardName, localCardSettings] of Object.entries(localCards)) {
        mergedCards[cardName] = this.mergeCardSettings(remoteCards[cardName], localCardSettings);
      }

      const dataToSync = this.sanitizeDataForSync({ cards: mergedCards });

      const pushResult = await this.push(dataToSync, pullResult.version, deviceId);

      if (pushResult.success) {
        return {
          success: true,
          data: dataToSync,
          version: pushResult.version
        };
      }

      return pushResult;
    }
  }

  function generateDeviceId() {
    const randomBytes = crypto.getRandomValues(new Uint8Array(16));
    const randomPart = Array.from(randomBytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `device-${Date.now()}-${randomPart}`;
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  async function deriveKey(passphrase, salt, iterations = 310000) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(passphrase),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encrypt(key, data) {
    const enc = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = enc.encode(JSON.stringify(data));

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      plaintext
    );

    return {
      ciphertext: arrayBufferToBase64(ciphertext),
      iv: arrayBufferToBase64(iv)
    };
  }

  async function decrypt(key, ciphertext, iv) {
    const dec = new TextDecoder();
    const ciphertextBuffer = base64ToArrayBuffer(ciphertext);
    const ivBuffer = base64ToArrayBuffer(iv);

    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBuffer },
      key,
      ciphertextBuffer
    );

    return JSON.parse(dec.decode(plaintext));
  }

  function generateSalt() {
    return crypto.getRandomValues(new Uint8Array(16));
  }

  class CryptoManager {
    constructor(passphrase, salt = null) {
      this.passphrase = passphrase;
      this.salt = salt || generateSalt();
      this.saltBase64 = arrayBufferToBase64(this.salt);
      this.key = null;
    }

    async init() {
      this.key = await deriveKey(this.passphrase, this.salt);
    }

    async setSalt(saltBase64) {
      if (!saltBase64 || saltBase64 === this.saltBase64) {
        return;
      }

      try {
        this.salt = base64ToArrayBuffer(saltBase64);
      } catch (error) {
        throw new Error('Invalid sync encryption salt');
      }

      this.saltBase64 = saltBase64;
      this.key = null;
      await this.init();
    }

    async encrypt(data) {
      if (!this.key) await this.init();
      const encrypted = await encrypt(this.key, data);
      return {
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        salt: this.saltBase64
      };
    }

    async decrypt(ciphertext, iv, saltBase64) {
      if (saltBase64) {
        await this.setSalt(saltBase64);
      }
      if (!this.key) await this.init();
      return decrypt(this.key, ciphertext, iv);
    }
  }

  class SyncClient {
    constructor(config) {
      this.config = config;
      this.storage = new StorageAdapter();
      this.api = new ApiClient(config.serverUrl);
      this.cryptoManager = null;
      this.syncEngine = null;
    }

    async init(passphrase) {
      this.cryptoManager = new CryptoManager(passphrase);
      await this.cryptoManager.init();
      this.syncEngine = new SyncEngine(this.api, this.cryptoManager, this.storage);
    }

    async login(email, passwordHash) {
      return this.api.login(email, passwordHash);
    }

    async register(email, passwordHash, tier = 'free') {
      return this.api.register(email, passwordHash, tier);
    }

    async sync(localData, currentVersion, deviceId) {
      if (!this.syncEngine) {
        throw new Error('SyncClient not initialized. Call init() first.');
      }
      return this.syncEngine.sync(localData, currentVersion, deviceId);
    }

    async getSharedMappings(cardType) {
      return this.api.getSharedMappings(cardType);
    }

    async contributeMappings(mappings) {
      return this.api.contributeMappings(mappings);
    }
  }

  function isCryptoKey(value) {
    return typeof CryptoKey !== 'undefined' && value instanceof CryptoKey;
  }

  class SyncSecretVault {
    constructor() {
      this.dbName = 'ccSubcapSyncVault';
      this.storeName = 'secrets';
      this.deviceKeyId = 'device-key-v1';
    }

    isAvailable() {
      return typeof indexedDB !== 'undefined' && Boolean(crypto?.subtle);
    }

    async openDb() {
      if (!this.isAvailable()) {
        throw new Error('Secure local vault is not available in this browser');
      }

      return new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(this.storeName)) {
            db.createObjectStore(this.storeName);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Failed to open secure local vault'));
      });
    }

    async getRecord(id) {
      const db = await this.openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, 'readonly');
        const store = tx.objectStore(this.storeName);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error || new Error('Failed to read secure local vault record'));
      });
    }

    async setRecord(id, value) {
      const db = await this.openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        store.put(value, id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Failed to write secure local vault record'));
      });
    }

    async deleteRecord(id) {
      const db = await this.openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        store.delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Failed to delete secure local vault record'));
      });
    }

    async getDeviceKey() {
      const record = await this.getRecord(this.deviceKeyId);
      return isCryptoKey(record) ? record : null;
    }

    async getOrCreateDeviceKey() {
      const existing = await this.getDeviceKey();
      if (existing) {
        return existing;
      }

      const key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
      await this.setRecord(this.deviceKeyId, key);
      return key;
    }

    async deleteDeviceKey() {
      await this.deleteRecord(this.deviceKeyId);
    }

    async encryptText(plaintext) {
      const key = await this.getOrCreateDeviceKey();
      const enc = new TextEncoder();
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        enc.encode(plaintext)
      );

      return {
        ciphertext: arrayBufferToBase64(ciphertext),
        iv: arrayBufferToBase64(iv)
      };
    }

    async decryptText(payload) {
      if (!payload || typeof payload.ciphertext !== 'string' || typeof payload.iv !== 'string') {
        throw new Error('Invalid encrypted local secret payload');
      }

      const key = await this.getDeviceKey();
      if (!key) {
        throw new Error('Secure local unlock key is missing');
      }

      const dec = new TextDecoder();
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToArrayBuffer(payload.iv) },
        key,
        base64ToArrayBuffer(payload.ciphertext)
      );
      return dec.decode(plaintext);
    }
  }

  // Build-time configuration for sync server
  const SYNC_CONFIG = {
    // Change this URL if self-hosting
    serverUrl: 'https://bank-cc-sync.laurenceputra.workers.dev',
    
    // For self-hosters: Update to your own server URL before building
    // Example: 'https://sync.example.com' or 'http://localhost:3000'
  };

  const SYNC_UNLOCK_CACHE_KEY = 'ccSubcapSyncUnlockCache';

  function getJwtTokenExpiryMs(token) {
    if (!token || typeof token !== 'string') {
      return null;
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    try {
      const payloadBase64Url = parts[1];
      const payloadBase64 = payloadBase64Url.replace(/-/g, '+').replace(/_/g, '/');
      const padding = payloadBase64.length % 4;
      const normalized = padding ? payloadBase64 + '='.repeat(4 - padding) : payloadBase64;
      const payload = JSON.parse(atob(normalized));
      if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) {
        return null;
      }
      return payload.exp * 1000;
    } catch (error) {
      return null;
    }
  }

  class SyncManager {
    constructor(storage) {
      this.storage = storage;
      this.syncClient = null;
      this.secretVault = new SyncSecretVault();
      this.config = this.loadSyncConfig();
      this.enabled = this.config.enabled === true;
      this.unlockInProgress = null;
      if (this.enabled) {
        this.initializeClientFromConfig();
      }
    }

    loadSyncConfig() {
      const raw = this.storage.get('ccSubcapSyncConfig', '{}');
      try {
        return JSON.parse(raw || '{}');
      } catch (error) {
        return {};
      }
    }

    saveSyncConfig(config) {
      this.storage.set('ccSubcapSyncConfig', JSON.stringify(config));
      this.config = config;
    }

    clearStorageKey(key) {
      if (typeof this.storage.remove === 'function') {
        this.storage.remove(key);
      } else {
        this.storage.set(key, '');
      }
    }

    loadRememberedUnlockCache() {
      const raw = this.storage.get(SYNC_UNLOCK_CACHE_KEY, '');
      if (!raw) {
        return null;
      }

      try {
        const cache = JSON.parse(raw);
        if (!cache || typeof cache !== 'object') {
          return null;
        }
        if (typeof cache.expiresAt !== 'number' || cache.expiresAt <= Date.now()) {
          this.clearRememberedUnlockCache(true);
          return null;
        }
        if (!cache.encrypted || typeof cache.encrypted !== 'object') {
          return null;
        }
        if (typeof cache.encrypted.ciphertext !== 'string' || typeof cache.encrypted.iv !== 'string') {
          return null;
        }
        return cache;
      } catch (error) {
        return null;
      }
    }

    hasRememberedUnlockCache() {
      return Boolean(this.loadRememberedUnlockCache());
    }

    clearRememberedUnlockCache(updateConfig = false) {
      this.clearStorageKey(SYNC_UNLOCK_CACHE_KEY);
      if (updateConfig && this.config?.rememberUnlock) {
        this.saveSyncConfig({
          ...this.config,
          rememberUnlock: false
        });
      }
    }

    async rememberUnlockPassphrase(passphrase, token = null) {
      if (!this.secretVault.isAvailable()) {
        throw new Error('Secure local unlock cache is unavailable in this browser');
      }

      const sourceToken = token || this.config.token;
      const tokenExpiresAt = getJwtTokenExpiryMs(sourceToken);
      if (!tokenExpiresAt || tokenExpiresAt <= Date.now()) {
        throw new Error('Cannot remember unlock because session token is missing or expired');
      }

      const encrypted = await this.secretVault.encryptText(passphrase);
      const cache = {
        version: 1,
        email: this.config.email || '',
        serverUrl: this.config.serverUrl || SYNC_CONFIG.serverUrl,
        createdAt: Date.now(),
        expiresAt: tokenExpiresAt,
        encrypted
      };

      this.storage.set(SYNC_UNLOCK_CACHE_KEY, JSON.stringify(cache));
    }

    async forgetRememberedUnlock() {
      this.clearRememberedUnlockCache(true);
      try {
        await this.secretVault.deleteDeviceKey();
      } catch (error) {
        // Ignore vault deletion failures; clearing encrypted cache is sufficient.
      }
      this.saveSyncConfig({
        ...this.config,
        rememberUnlock: false
      });
      return { success: true };
    }

    initializeClientFromConfig() {
      const serverUrl = this.config.serverUrl || SYNC_CONFIG.serverUrl;
      try {
        validateServerUrl(serverUrl);
      } catch (error) {
        console.error('[SyncManager] Invalid saved server URL:', error);
        return false;
      }

      this.syncClient = new SyncClient({ serverUrl });
      if (this.config.token) {
        this.syncClient.api.setToken(this.config.token);
      }
      return true;
    }

    isEnabled() {
      return this.config.enabled === true;
    }

    isUnlocked() {
      return Boolean(this.syncClient && this.syncClient.syncEngine);
    }

    async tryUnlockFromRememberedCache() {
      const cache = this.loadRememberedUnlockCache();
      if (!cache) {
        return false;
      }

      if (cache.email && this.config.email && cache.email !== this.config.email) {
        this.clearRememberedUnlockCache(true);
        return false;
      }

      if (cache.serverUrl && this.config.serverUrl && cache.serverUrl !== this.config.serverUrl) {
        this.clearRememberedUnlockCache(true);
        return false;
      }

      try {
        const passphrase = await this.secretVault.decryptText(cache.encrypted);
        const result = await this.unlockSync(passphrase, {
          remember: true,
          fromRememberedCache: true
        });
        if (!result.success) {
          this.clearRememberedUnlockCache(true);
          return false;
        }
        return true;
      } catch (error) {
        console.warn('[SyncManager] Remembered unlock cache is unusable:', error);
        this.clearRememberedUnlockCache(true);
        return false;
      }
    }

    async unlockSync(passphrase, options = {}) {
      if (!this.isEnabled()) {
        return { success: false, error: 'Sync not enabled' };
      }

      if (!passphrase || typeof passphrase !== 'string') {
        return { success: false, error: 'Password is required to unlock sync' };
      }

      if (this.unlockInProgress) {
        return this.unlockInProgress;
      }

      const remember = options.remember === true;
      const fromRememberedCache = options.fromRememberedCache === true;

      try {
        this.unlockInProgress = (async () => {
          if (!this.syncClient && !this.initializeClientFromConfig()) {
            return { success: false, error: 'Invalid sync configuration. Please setup sync again.' };
          }

          await this.syncClient.init(passphrase);

          if (this.config.email) {
            const hashedPassphrase = await this.hashPassphrase(passphrase);
            const authResult = await this.syncClient.login(this.config.email, hashedPassphrase);
            this.syncClient.api.setToken(authResult.token);
            this.saveSyncConfig({
              ...this.config,
              token: authResult.token,
              tokenExpiresAt: getJwtTokenExpiryMs(authResult.token) || 0,
              tier: authResult.tier
            });
          }

          if (remember) {
            try {
              await this.rememberUnlockPassphrase(passphrase, this.config.token);
              this.saveSyncConfig({
                ...this.config,
                rememberUnlock: true
              });
            } catch (error) {
              console.warn('[SyncManager] Failed to persist remembered unlock cache:', error);
              return { success: true, warning: 'Sync unlocked, but failed to remember on this device.' };
            }
          } else if (!fromRememberedCache) {
            this.clearRememberedUnlockCache(true);
          }

          return { success: true };
        })();

        return await this.unlockInProgress;
      } catch (error) {
        console.error('[SyncManager] Unlock failed:', error);
        return { success: false, error: error.message };
      } finally {
        this.unlockInProgress = null;
      }
    }

    async setupSync(email, passphrase, serverUrl, rememberUnlock = false) {
      try {
        const deviceId = generateDeviceId();
        
        // Use provided serverUrl or fall back to default
        const actualServerUrl = serverUrl || SYNC_CONFIG.serverUrl;
        
        // Validate server URL
        validateServerUrl(actualServerUrl);
        
        this.syncClient = new SyncClient({
          serverUrl: actualServerUrl
        });

        await this.syncClient.init(passphrase);

        // Store email temporarily for salt derivation in hashPassphrase
        this.config.email = email;
        
        // Hash passphrase before sending to server
        const hashedPassphrase = await this.hashPassphrase(passphrase);
        
        // Try login first, fallback to register
        let authResult;
        try {
          authResult = await this.syncClient.login(email, hashedPassphrase);
        } catch (error) {
          authResult = await this.syncClient.register(email, hashedPassphrase);
        }

        this.saveSyncConfig({
          enabled: true,
          deviceId,
          email,
          token: authResult.token,
          tokenExpiresAt: getJwtTokenExpiryMs(authResult.token) || 0,
          tier: authResult.tier,
          shareMappings: authResult.tier === 'free', // Free users share by default
          lastSync: 0,
          serverUrl: actualServerUrl, // Store custom server URL
          rememberUnlock: false
        });
        this.clearRememberedUnlockCache();

        if (rememberUnlock) {
          try {
            await this.rememberUnlockPassphrase(passphrase, authResult.token);
            this.saveSyncConfig({
              ...this.config,
              rememberUnlock: true
            });
          } catch (error) {
            console.warn('[SyncManager] Failed to persist remembered unlock cache during setup:', error);
          }
        }

        this.syncClient.api.setToken(authResult.token);
        this.enabled = true;

        return { success: true };
      } catch (error) {
        console.error('[SyncManager] Setup failed:', error);
        return { success: false, error: error.message };
      }
    }

    async sync(localData) {
      if (!this.isEnabled()) {
        return { success: false, error: 'Sync not enabled' };
      }

      if (!this.syncClient && !this.initializeClientFromConfig()) {
        return { success: false, error: 'Invalid sync configuration. Please setup sync again.' };
      }

      if (!this.isUnlocked()) {
        const unlockedFromCache = await this.tryUnlockFromRememberedCache();
        if (!unlockedFromCache) {
          return { success: false, error: 'Sync is locked. Enter your password to unlock sync.' };
        }
      }

      try {
        const result = await this.syncClient.sync(
          localData,
          this.config.version || 0,
          this.config.deviceId
        );

        if (result.success) {
          this.saveSyncConfig({
            ...this.config,
            version: result.version,
            lastSync: Date.now()
          });
        }

        return result;
      } catch (error) {
        console.error('[SyncManager] Sync failed:', error);
        return { success: false, error: error.message };
      }
    }

    async getSharedMappings(cardType) {
      if (!this.isEnabled() || !this.syncClient) {
        return { success: false, mappings: [] };
      }

      try {
        const result = await this.syncClient.getSharedMappings(cardType);
        return { success: true, mappings: result.mappings || [] };
      } catch (error) {
        console.error('[SyncManager] Get shared mappings failed:', error);
        return { success: false, mappings: [] };
      }
    }

    async contributeMappings(mappings) {
      if (!this.isEnabled() || !this.syncClient) {
        return { success: false };
      }

      if (!this.config.shareMappings) {
        return { success: true, message: 'Sharing disabled' };
      }

      try {
        await this.syncClient.contributeMappings(mappings);
        return { success: true, contributed: mappings.length };
      } catch (error) {
        console.error('[SyncManager] Contribute mappings failed:', error);
        return { success: false, error: error.message };
      }
    }

    /**
     * Hash passphrase using PBKDF2 with Web Crypto API
     * SECURITY: Uses 310,000 iterations (OWASP 2023 recommendation for PBKDF2-SHA256)
     * to protect against brute-force attacks. Salt is derived from email to ensure
     * deterministic hashing for authentication while maintaining uniqueness per user.
     */
    async hashPassphrase(passphrase) {
      const enc = new TextEncoder();
      
      // Derive salt from email for deterministic authentication
      // SECURITY: Each user has unique salt, preventing rainbow table attacks
      const saltData = enc.encode(this.config.email || 'default-salt');
      const saltHash = await crypto.subtle.digest('SHA-256', saltData);
      const salt = new Uint8Array(saltHash).slice(0, 16);
      
      // Import passphrase as key material
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        enc.encode(passphrase),
        'PBKDF2',
        false,
        ['deriveBits']
      );
      
      // Derive 256-bit hash using PBKDF2 with 310,000 iterations
      const derivedBits = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: 310000,
          hash: 'SHA-256'
        },
        keyMaterial,
        256
      );
      
      // Return as hex string for server comparison
      return Array.from(new Uint8Array(derivedBits))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    }

  disableSync() {
    this.clearRememberedUnlockCache();
    this.secretVault.deleteDeviceKey().catch(() => {});
    this.saveSyncConfig({});
    this.enabled = false;
    this.syncClient = null;
  }
}

  const UI_CLASSES = {
    stack: 'cc-subcap-stack',
    stackTight: 'cc-subcap-stack-tight',
    stackLoose: 'cc-subcap-stack-loose',
    tab: 'cc-subcap-tab',
    section: 'cc-subcap-section',
    sectionAccent: 'cc-subcap-section-accent',
    sectionPanel: 'cc-subcap-section-panel',
    card: 'cc-subcap-card',
    divider: 'cc-subcap-divider',
    notice: 'cc-subcap-notice',
    modal: 'cc-subcap-modal',
    buttonRow: 'cc-subcap-button-row',
    status: 'cc-subcap-status',
    hidden: 'cc-subcap-hidden',
    fab: 'cc-subcap-fab',
    overlay: 'cc-subcap-overlay-root',
    panel: 'cc-subcap-panel',
    panelHeader: 'cc-subcap-panel-header',
    title: 'cc-subcap-title',
    closeButton: 'cc-subcap-close-button',
    tabs: 'cc-subcap-tabs',
    tabButton: 'cc-subcap-tab-button',
    tabButtonActive: 'cc-subcap-tab-button-active',
    meta: 'cc-subcap-meta',
    small: 'cc-subcap-small',
    spendMonthHeader: 'cc-subcap-month-header',
    spendMonthTotal: 'cc-subcap-month-total',
    spendTotalsList: 'cc-subcap-totals-list',
    spendDetailsTable: 'cc-subcap-details-table',
    spendDetailsToggle: 'cc-subcap-spend-details',
    spendChevron: 'cc-subcap-spend-chevron',
    spendAmountWrap: 'cc-subcap-spend-amount-wrap',
    spendCapBadge: 'cc-subcap-spend-cap-badge',
    fieldLabel: 'cc-subcap-field-label',
    input: 'cc-subcap-input',
    checkboxLabel: 'cc-subcap-checkbox-label',
    primaryButton: 'cc-subcap-btn-primary',
    secondaryButton: 'cc-subcap-btn-secondary',
    dangerButton: 'cc-subcap-btn-danger',
    dialogBackdrop: 'cc-subcap-dialog-backdrop'
  };

  let uiStylesInjected = false;

  function ensureUiStyles(theme) {
    if (uiStylesInjected) {
      return;
    }

    const css = `
    .${UI_CLASSES.hidden} { display: none !important; }

    .${UI_CLASSES.stack},
    .${UI_CLASSES.stackTight},
    .${UI_CLASSES.stackLoose} {
      display: flex;
      flex-direction: column;
    }
    .${UI_CLASSES.stack} { gap: 12px; }
    .${UI_CLASSES.stackTight} { gap: 8px; }
    .${UI_CLASSES.stackLoose} { gap: 16px; }
    .${UI_CLASSES.tab} { padding: 16px; }
    .${UI_CLASSES.section} {
      padding: 12px;
      border-radius: 10px;
      border: 1px solid ${theme.border};
      background: ${theme.surface};
    }
    .${UI_CLASSES.sectionAccent} { background: ${theme.accentSoft}; }
    .${UI_CLASSES.sectionPanel} { background: ${theme.panel}; }
    .${UI_CLASSES.card} {
      padding: 12px;
      border-radius: 12px;
      border: 1px solid ${theme.border};
      background: ${theme.surface};
      box-shadow: 0 8px 20px rgba(15, 23, 42, 0.06);
    }
    .${UI_CLASSES.divider} {
      border-top: 1px solid ${theme.border};
      margin: 0;
    }
    .${UI_CLASSES.notice} {
      padding: 12px;
      border-radius: 8px;
      border: 1px solid ${theme.warning};
      background: ${theme.warningSoft};
      font-size: 12px;
      color: ${theme.warning};
    }
    .${UI_CLASSES.modal} {
      padding: 24px;
      border-radius: 16px;
      background: ${theme.surface};
      border: 1px solid ${theme.border};
      box-shadow: ${theme.shadow};
      width: min(500px, 92vw);
    }
    .${UI_CLASSES.buttonRow} {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .${UI_CLASSES.status} {
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid ${theme.border};
      background: ${theme.panel};
      color: ${theme.text};
      font-size: 13px;
    }
    .${UI_CLASSES.status}[data-variant="warning"] {
      border-color: ${theme.warning};
      background: ${theme.warningSoft};
      color: ${theme.warning};
    }
    .${UI_CLASSES.status}[data-variant="error"] {
      border-color: ${theme.errorBorder};
      background: ${theme.errorSoft};
      color: ${theme.errorText};
    }
    .${UI_CLASSES.status}[data-variant="success"] {
      border-color: ${theme.successBorder};
      background: ${theme.successSoft};
      color: ${theme.success};
    }
    .${UI_CLASSES.status}[data-variant="info"] {
      border-color: ${theme.accent};
      background: ${theme.accentSoft};
      color: ${theme.accentText};
    }

    .${UI_CLASSES.fab} {
      position: fixed;
      right: 24px;
      bottom: 24px;
      z-index: 99999;
      padding: 12px 16px;
      border-radius: 999px;
      border: 1px solid ${theme.accent};
      background: ${theme.accent};
      color: #ffffff;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: ${theme.accentShadow};
    }

    .${UI_CLASSES.overlay} {
      position: fixed;
      inset: 0;
      z-index: 99998;
      background: ${theme.overlay};
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .${UI_CLASSES.dialogBackdrop} {
      position: fixed;
      inset: 0;
      z-index: 100001;
      background: ${theme.overlay};
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .${UI_CLASSES.panel} {
      width: min(960px, 92vw);
      max-height: 85vh;
      overflow-y: auto;
      overflow-x: hidden;
      border-radius: 12px;
      border: 1px solid ${theme.border};
      background: ${theme.panel};
      color: ${theme.text};
      box-shadow: ${theme.shadow};
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px;
    }
    .${UI_CLASSES.panelHeader} {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    .${UI_CLASSES.title} {
      margin: 0;
      color: ${theme.accent};
      font-size: 16px;
      font-weight: 600;
    }
    .${UI_CLASSES.meta} {
      margin: 0;
      color: ${theme.text};
      font-size: 14px;
    }
    .${UI_CLASSES.small} {
      margin: 0;
      color: ${theme.muted};
      font-size: 12px;
    }
    .${UI_CLASSES.closeButton},
    .${UI_CLASSES.primaryButton},
    .${UI_CLASSES.secondaryButton},
    .${UI_CLASSES.dangerButton} {
      border-radius: 8px;
      padding: 8px 12px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid ${theme.border};
    }
    .${UI_CLASSES.closeButton},
    .${UI_CLASSES.secondaryButton} {
      background: ${theme.surface};
      color: ${theme.text};
    }
    .${UI_CLASSES.primaryButton} {
      background: ${theme.accent};
      border-color: ${theme.accent};
      color: #fff;
    }
    .${UI_CLASSES.dangerButton} {
      background: ${theme.warning};
      border-color: ${theme.warning};
      color: #fff;
    }

    .${UI_CLASSES.tabs} {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .${UI_CLASSES.tabButton} {
      border-radius: 999px;
      padding: 6px 12px;
      border: 1px solid ${theme.border};
      background: transparent;
      color: ${theme.text};
      font-weight: 500;
      cursor: pointer;
    }
    .${UI_CLASSES.tabButton}.${UI_CLASSES.tabButtonActive} {
      border-color: ${theme.accent};
      background: ${theme.accentSoft};
      color: ${theme.accentText};
      font-weight: 600;
    }

    .${UI_CLASSES.fieldLabel} {
      display: block;
      font-weight: 600;
      color: ${theme.text};
      font-size: 13px;
    }
    .${UI_CLASSES.input} {
      width: 100%;
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid ${theme.border};
      background: ${theme.surface};
      color: ${theme.text};
      box-sizing: border-box;
      font-size: 14px;
    }
    .${UI_CLASSES.checkboxLabel} {
      display: flex;
      align-items: center;
      gap: 8px;
      color: ${theme.muted};
      font-size: 12px;
    }

    .${UI_CLASSES.spendMonthHeader} {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      font-weight: 600;
    }
    .${UI_CLASSES.spendMonthTotal} {
      border-radius: 999px;
      padding: 4px 8px;
      background: ${theme.accentSoft};
      border: 1px solid ${theme.border};
      color: ${theme.accentText};
      font-size: 12px;
      font-weight: 600;
    }
    .${UI_CLASSES.spendTotalsList} {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 6px 12px;
      font-size: 13px;
    }
    .${UI_CLASSES.spendAmountWrap} {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .${UI_CLASSES.spendCapBadge} {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 2px 8px;
      border: 1px solid ${theme.border};
      font-size: 11px;
      font-weight: 600;
      line-height: 1.4;
    }
    .${UI_CLASSES.spendDetailsToggle} > summary {
      list-style: none;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
      color: ${theme.accentText};
    }
    .${UI_CLASSES.spendDetailsToggle} > summary::-webkit-details-marker {
      display: none;
    }
    .${UI_CLASSES.spendChevron}::before {
      content: '▸';
      display: inline-block;
      width: 12px;
    }
    .${UI_CLASSES.spendDetailsToggle}[open] .${UI_CLASSES.spendChevron}::before {
      content: '▾';
    }
    .${UI_CLASSES.spendDetailsTable} {
      display: grid;
      grid-template-columns: 1.6fr 0.6fr 0.6fr;
      gap: 6px 10px;
      font-size: 12px;
    }
    .${UI_CLASSES.spendDetailsTable} > strong {
      color: ${theme.muted};
    }
    @media (max-width: 768px) {
      .${UI_CLASSES.panel} {
        width: min(98vw, 98vw);
        max-height: 92vh;
      }
      .${UI_CLASSES.spendDetailsTable} {
        grid-template-columns: 1fr;
      }
    }
    `;

    if (typeof GM_addStyle === 'function') {
      GM_addStyle(css);
    } else {
      const style = document.createElement('style');
      style.id = 'cc-subcap-styles';
      style.textContent = css;
      document.head.appendChild(style);
    }

    uiStylesInjected = true;
  }

  function setStatusMessage(statusElement, message = '', variant = 'info') {
    if (!statusElement) {
      return;
    }
    if (!message) {
      statusElement.textContent = '';
      statusElement.classList.add(UI_CLASSES.hidden);
      statusElement.removeAttribute('data-variant');
      return;
    }
    statusElement.textContent = message;
    statusElement.setAttribute('data-variant', variant);
    statusElement.classList.remove(UI_CLASSES.hidden);
  }

  function calculateMonthlyTotalsForSync(transactions, cardSettings) {
    const totalsByMonth = {};
    const safeSettings = isObjectRecord(cardSettings) ? cardSettings : {};
    const defaultCategory =
      typeof safeSettings.defaultCategory === 'string' && safeSettings.defaultCategory
        ? safeSettings.defaultCategory
        : 'Others';

    (Array.isArray(transactions) ? transactions : []).forEach((transaction) => {
      const monthKey = typeof transaction?.posting_month === 'string'
        ? transaction.posting_month
        : (
            typeof transaction?.posting_date_iso === 'string' && transaction.posting_date_iso.length >= 7
              ? transaction.posting_date_iso.slice(0, 7)
              : ''
          );
      if (!monthKey) {
        return;
      }
      if (typeof transaction.amount_value !== 'number' || !Number.isFinite(transaction.amount_value)) {
        return;
      }
      if (!totalsByMonth[monthKey]) {
        totalsByMonth[monthKey] = { totals: {}, total_amount: 0 };
      }
      const category =
        typeof transaction.category === 'string' && transaction.category
          ? transaction.category
          : defaultCategory;
      totalsByMonth[monthKey].totals[category] =
        (totalsByMonth[monthKey].totals[category] || 0) + transaction.amount_value;
      totalsByMonth[monthKey].total_amount += transaction.amount_value;
    });

    return totalsByMonth;
  }

  function buildSyncCardSnapshot(cardName, cardSettings, storedTransactions) {
    const safeCardSettings = isObjectRecord(cardSettings) ? cardSettings : {};
    const transactions = Array.isArray(storedTransactions) ? storedTransactions : [];
    return {
      selectedCategories: Array.isArray(safeCardSettings.selectedCategories)
        ? safeCardSettings.selectedCategories.slice()
        : [],
      defaultCategory:
        typeof safeCardSettings.defaultCategory === 'string' && safeCardSettings.defaultCategory
          ? safeCardSettings.defaultCategory
          : 'Others',
      merchantMap: isObjectRecord(safeCardSettings.merchantMap) ? { ...safeCardSettings.merchantMap } : {},
      monthlyTotals: calculateMonthlyTotalsForSync(transactions, safeCardSettings)
    };
  }

  function createSyncTab(syncManager, cardName, cardSettings, storedTransactions, THEME, onSyncStateChanged = () => {}) {
    ensureUiStyles(THEME);
    const container = document.createElement('div');
    container.id = 'cc-subcap-sync';
    container.classList.add(UI_CLASSES.tab, UI_CLASSES.stackLoose, UI_CLASSES.hidden);

    const isEnabled = syncManager.isEnabled();
    const config = syncManager.config || {};

    if (!isEnabled) {
      container.innerHTML = `
      <div class="${UI_CLASSES.stack}">
        <h3 class="${UI_CLASSES.title}">Sync Settings</h3>
        <p class="${UI_CLASSES.meta}">Enable sync to access your settings across devices.</p>
        <div class="${UI_CLASSES.section} ${UI_CLASSES.sectionAccent}">
          <strong>Privacy First</strong>
          <ul>
            <li>Settings are encrypted before leaving your browser</li>
            <li>Raw transactions never leave your browser</li>
            <li>Sync payload contains settings and monthly totals only</li>
          </ul>
        </div>
        <button id="setup-sync-btn" type="button" class="${UI_CLASSES.primaryButton}">Setup Sync</button>
      </div>
    `;

      const setupBtn = container.querySelector('#setup-sync-btn');
      setupBtn.addEventListener('click', () => {
        showSyncSetupDialog(syncManager, THEME, onSyncStateChanged);
      });
      return container;
    }

    const isUnlocked = syncManager.isUnlocked();
    const hasRememberedUnlock = syncManager.hasRememberedUnlockCache();
    const lastSync = config.lastSync ? new Date(config.lastSync).toLocaleString() : 'Never';
    const lockStateText = isUnlocked
      ? 'Unlocked'
      : (hasRememberedUnlock ? 'Locked (auto unlock available)' : 'Locked (password required)');
    const rememberChecked = config.rememberUnlock === true || hasRememberedUnlock;

    container.innerHTML = `
    <div class="${UI_CLASSES.stack}">
      <h3 class="${UI_CLASSES.title}">Sync Settings</h3>
      <div class="${UI_CLASSES.section} ${UI_CLASSES.sectionPanel} ${UI_CLASSES.stackTight}">
        <p class="${UI_CLASSES.meta}"><strong>Status:</strong> Enabled (${lockStateText})</p>
        <p class="${UI_CLASSES.meta}"><strong>Email:</strong> ${config.email || '-'}</p>
        <p class="${UI_CLASSES.meta}"><strong>Last Sync:</strong> ${lastSync}</p>
        <p class="${UI_CLASSES.meta}"><strong>Tier:</strong> ${config.tier || '-'}</p>
        <p class="${UI_CLASSES.small}">Sync updates only the active card and keeps other cards' remote settings.</p>
      </div>
      ${isUnlocked ? '' : `
      <div class="${UI_CLASSES.stackTight}">
        <label for="sync-unlock-passphrase" class="${UI_CLASSES.fieldLabel}">Password (unlock for this session)</label>
        <input id="sync-unlock-passphrase" class="${UI_CLASSES.input}" type="password" placeholder="Enter sync password" />
        <label class="${UI_CLASSES.checkboxLabel}">
          <input id="sync-remember-unlock" type="checkbox" ${rememberChecked ? 'checked' : ''}/>
          Remember sync on this device until session token expiry or logout
        </label>
        <button id="unlock-sync-btn" type="button" class="${UI_CLASSES.secondaryButton}">Unlock Sync</button>
      </div>
      `}
      <div class="${UI_CLASSES.buttonRow}">
        <button id="sync-now-btn" type="button" class="${UI_CLASSES.primaryButton}">Sync Now</button>
        <button id="disable-sync-btn" type="button" class="${UI_CLASSES.dangerButton}">Disable Sync</button>
        ${hasRememberedUnlock ? `<button id="forget-sync-unlock-btn" type="button" class="${UI_CLASSES.secondaryButton}">Forget Saved Unlock</button>` : ''}
      </div>
      <div id="sync-status" class="${UI_CLASSES.status} ${UI_CLASSES.hidden}" role="status" aria-live="polite"></div>
    </div>
  `;

    const statusDiv = container.querySelector('#sync-status');
    const getRememberPreference = () => {
      const rememberInput = container.querySelector('#sync-remember-unlock');
      return Boolean(rememberInput?.checked);
    };

    const unlockButton = container.querySelector('#unlock-sync-btn');
    if (unlockButton) {
      unlockButton.addEventListener('click', async () => {
        const passphraseInput = container.querySelector('#sync-unlock-passphrase');
        const passphrase = passphraseInput?.value || '';
        if (!passphrase) {
          setStatusMessage(statusDiv, 'Password is required to unlock sync.', 'warning');
          return;
        }

        setStatusMessage(statusDiv, 'Unlocking sync...', 'info');
        const unlockResult = await syncManager.unlockSync(passphrase, {
          remember: getRememberPreference()
        });
        if (!unlockResult.success) {
          setStatusMessage(statusDiv, `Unlock failed: ${unlockResult.error}`, 'warning');
          return;
        }

        setStatusMessage(
          statusDiv,
          unlockResult.warning ? `Sync unlocked (${unlockResult.warning})` : 'Sync unlocked',
          'success'
        );
        onSyncStateChanged();
      });
    }

    const forgetButton = container.querySelector('#forget-sync-unlock-btn');
    if (forgetButton) {
      forgetButton.addEventListener('click', async () => {
        setStatusMessage(statusDiv, 'Forgetting saved unlock...', 'info');
        await syncManager.forgetRememberedUnlock();
        setStatusMessage(statusDiv, 'Saved unlock removed for this device.', 'success');
        onSyncStateChanged();
      });
    }

    const syncNowButton = container.querySelector('#sync-now-btn');
    syncNowButton.addEventListener('click', async () => {
      setStatusMessage(statusDiv, 'Syncing...', 'info');

      if (!syncManager.isUnlocked()) {
        const unlockedFromCache = await syncManager.tryUnlockFromRememberedCache();
        if (unlockedFromCache) {
          onSyncStateChanged();
        }

        const passphraseInput = container.querySelector('#sync-unlock-passphrase');
        const passphrase = passphraseInput?.value || '';

        if (!syncManager.isUnlocked() && !passphrase) {
          setStatusMessage(statusDiv, 'Sync is locked. Enter your password to unlock first.', 'warning');
          return;
        }

        if (!syncManager.isUnlocked()) {
          const unlockResult = await syncManager.unlockSync(passphrase, {
            remember: getRememberPreference()
          });
          if (!unlockResult.success) {
            setStatusMessage(statusDiv, `Unlock failed: ${unlockResult.error}`, 'warning');
            return;
          }
        }
      }

      const activeCardPayload = buildSyncCardSnapshot(cardName, cardSettings, storedTransactions);
      const result = await syncManager.sync({ cards: { [cardName]: activeCardPayload } });

      if (result.success) {
        setStatusMessage(statusDiv, 'Synced successfully.', 'success');
        window.setTimeout(() => setStatusMessage(statusDiv, ''), 3000);
      } else {
        setStatusMessage(statusDiv, `Sync failed: ${result.error}`, 'error');
      }
    });

    container.querySelector('#disable-sync-btn').addEventListener('click', () => {
      if (confirm('Are you sure you want to disable sync? Your local data will remain intact.')) {
        syncManager.disableSync();
        onSyncStateChanged();
      }
    });

    return container;
  }

  function showSyncSetupDialog(syncManager, THEME, onSyncStateChanged = () => {}) {
    ensureUiStyles(THEME);
    const overlay = document.createElement('div');
    overlay.classList.add(UI_CLASSES.dialogBackdrop);
    overlay.innerHTML = `
    <div class="${UI_CLASSES.modal} ${UI_CLASSES.stack}">
      <h3 class="${UI_CLASSES.title}">Setup Sync</h3>
      <div class="${UI_CLASSES.stackTight}">
        <label class="${UI_CLASSES.fieldLabel}" for="sync-server-url">Server URL</label>
        <input id="sync-server-url" class="${UI_CLASSES.input}" type="url" placeholder="https://your-server.com" value="${SYNC_CONFIG.serverUrl}" />
      </div>
      <div class="${UI_CLASSES.stackTight}">
        <label class="${UI_CLASSES.fieldLabel}" for="sync-email">Email</label>
        <input id="sync-email" class="${UI_CLASSES.input}" type="email" placeholder="your@email.com" />
      </div>
      <div class="${UI_CLASSES.stackTight}">
        <label class="${UI_CLASSES.fieldLabel}" for="sync-passphrase">Password</label>
        <input id="sync-passphrase" class="${UI_CLASSES.input}" type="password" placeholder="Enter sync password" />
      </div>
      <label class="${UI_CLASSES.checkboxLabel}">
        <input id="sync-remember-unlock-setup" type="checkbox"/>
        Remember sync on this device until session token expiry or logout
      </label>
      <div class="${UI_CLASSES.buttonRow}">
        <button id="sync-setup-save" type="button" class="${UI_CLASSES.primaryButton}">Setup</button>
        <button id="sync-setup-cancel" type="button" class="${UI_CLASSES.secondaryButton}">Cancel</button>
      </div>
      <div id="sync-setup-status" class="${UI_CLASSES.status} ${UI_CLASSES.hidden}" role="status" aria-live="polite"></div>
    </div>
  `;

    const closeDialog = () => overlay.remove();
    const statusDiv = overlay.querySelector('#sync-setup-status');

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        closeDialog();
      }
    });
    overlay.querySelector('#sync-setup-cancel').addEventListener('click', closeDialog);

    overlay.querySelector('#sync-setup-save').addEventListener('click', async () => {
      const serverUrl = overlay.querySelector('#sync-server-url').value.trim();
      const email = overlay.querySelector('#sync-email').value.trim();
      const passphrase = overlay.querySelector('#sync-passphrase').value;
      const rememberUnlock = overlay.querySelector('#sync-remember-unlock-setup')?.checked === true;

      if (!serverUrl || !email || !passphrase) {
        setStatusMessage(statusDiv, 'All fields are required.', 'warning');
        return;
      }

      try {
        validateServerUrl(serverUrl);
      } catch (error) {
        setStatusMessage(statusDiv, error.message, 'warning');
        return;
      }

      setStatusMessage(statusDiv, 'Setting up sync...', 'info');
      const result = await syncManager.setupSync(email, passphrase, serverUrl, rememberUnlock);
      if (result.success) {
        setStatusMessage(statusDiv, 'Sync setup complete.', 'success');
        window.setTimeout(() => {
          closeDialog();
          onSyncStateChanged();
        }, 500);
        return;
      }

      setStatusMessage(statusDiv, `Setup failed: ${result.error}`, 'error');
    });

    document.body.appendChild(overlay);
  }

  // Phase 3: Sync integration (imports added)

  (() => {

    if (window.__ccSubcapInjected) {
      return;
    }
    window.__ccSubcapInjected = true;

    const STORAGE_KEY = 'ccSubcapSettings';

    const PORTAL_PROFILES = [
      {
        id: 'uob-pib',
        host: 'pib.uob.com.sg',
        pathPrefix: '/PIBCust/2FA/processSubmit.do',
        urlPrefix: 'https://pib.uob.com.sg/PIBCust/2FA/processSubmit.do',
        waitTimeoutMs: 15000,
        cardNameXPaths: [
          '/html/body/section/section/section/section/section/section/section/section/div[1]/div/form[1]/div[1]/div/div[1]/div/div[2]/h3'
        ],
        tableBodyXPaths: [
          '/html/body/section/section/section/section/section/section/section/section/div[1]/div/form[1]/div[9]/div[2]/table/tbody'
        ]
      },
      {
        id: 'maybank2u-sg',
        host: 'cib.maybank2u.com.sg',
        pathPrefix: '/m2u/accounts/cards',
        urlPrefix: 'https://cib.maybank2u.com.sg/m2u/accounts/cards',
        allowOverlayWithoutRows: true,
        waitTimeoutMs: 30000,
        cardNameXPaths: [
          '/html/body/div/div/div[1]/div[1]/div[3]/div[2]/div[1]/div/div[1]/div[1]/div[2]/div[2]/span',
          '//*[contains(translate(normalize-space(.), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "xl rewards")][1]'
        ],
        tableBodyXPaths: [
          '/html/body/div/div/div[1]/div[1]/div[3]/div[2]/div[1]/div/div[2]/div/div[2]/div/div/table/tbody',
          '(//table//tbody)[1]'
        ]
      }
    ];

    const CARD_CONFIGS = {
      "LADY'S SOLITAIRE CARD": {
        categories: [
          'Beauty & Wellness',
          'Dining',
          'Entertainment',
          'Family',
          'Fashion',
          'Transport',
          'Travel'
        ],
        subcapSlots: 2,
        showManageTab: true
      },
      'XL Rewards Card': {
        categories: ['Local', 'Forex'],
        subcapSlots: 2,
        showManageTab: false
      }
    };

    const UI_IDS = {
      button: 'cc-subcap-btn',
      overlay: 'cc-subcap-overlay',
      manageContent: 'cc-subcap-manage',
      spendContent: 'cc-subcap-spend',
      summaryContent: 'cc-subcap-summary',
      syncContent: 'cc-subcap-sync',
      tabManage: 'cc-subcap-tab-manage',
      tabSpend: 'cc-subcap-tab-spend',
      tabSync: 'cc-subcap-tab-sync',
      close: 'cc-subcap-close'
    };

    const THEME = {
      text: '#0f172a',
      muted: '#475569',
      panel: '#f8fafc',
      surface: '#ffffff',
      border: '#d0d5dd',
      accent: '#2563eb',
      accentText: '#1e3a8a',
      accentSoft: '#e0e7ff',
      accentShadow: '0 18px 32px rgba(37, 99, 235, 0.28)',
      warning: '#b45309',
      warningSoft: '#fef3c7',
      error: '#ef4444',
      errorSoft: '#fee2e2',
      errorText: '#991b1b',
      errorBorder: '#fca5a5',
      success: '#166534',
      successSoft: '#dcfce7',
      successBorder: '#86efac',
      overlay: 'rgba(15, 23, 42, 0.25)',
      shadow: '0 18px 40px rgba(15, 23, 42, 0.15)'
    };


    const TRANSACTION_LOADING_NOTICE =
      '💡 <strong>Totals looking wrong, or missing transactions?</strong><br>Load all transactions on the bank site first (e.g. paginate / "View More"), then reopen the panel through the button.';

    const CAP_POLICY_CACHE_KEY = 'ccSubcapCapPolicyCache';
    const CAP_POLICY_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
    const CAP_POLICY_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
    const EMBEDDED_CAP_POLICY = Object.freeze({
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
    let activeCapPolicy = EMBEDDED_CAP_POLICY;
    let capPolicyLoadedAt = 0;
    let capPolicyLoadPromise = null;
    let hasInitializedCachedCapPolicy = false;

    // Helper functions
    function applyStyles(element, styles) {
      Object.entries(styles).forEach(([key, value]) => {
        element.style[key] = value;
      });
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

    function getCapSeverity(value, cap, policy = activeCapPolicy) {
      if (typeof value !== 'number' || !Number.isFinite(value) || typeof cap !== 'number' || cap <= 0) {
        return 'normal';
      }
      const ratio = value / cap;
      const warningRatio = policy.thresholds?.warningRatio ?? EMBEDDED_CAP_POLICY.thresholds.warningRatio;
      const criticalRatio = policy.thresholds?.criticalRatio ?? EMBEDDED_CAP_POLICY.thresholds.criticalRatio;
      if (ratio >= criticalRatio) {
        return 'critical';
      }
      if (ratio >= warningRatio) {
        return 'warning';
      }
      return 'normal';
    }

    function applyCapToneStyles(element, severity, policy = activeCapPolicy, includeBackground = false) {
      const tone = policy.styles?.[severity] || policy.styles?.normal || EMBEDDED_CAP_POLICY.styles.normal;
      element.style.color = tone.text || EMBEDDED_CAP_POLICY.styles.normal.text;
      if (includeBackground) {
        element.style.background = tone.background || EMBEDDED_CAP_POLICY.styles.normal.background;
        element.style.borderColor = tone.border || EMBEDDED_CAP_POLICY.styles.normal.border;
      }
    }

    function readCachedCapPolicy() {
      const raw = storage.get(CAP_POLICY_CACHE_KEY, '');
      if (!raw) {
        return null;
      }
      try {
        const parsed = JSON.parse(raw);
        if (!isObjectRecord(parsed)) {
          return null;
        }
        if (typeof parsed.savedAt !== 'number' || !Number.isFinite(parsed.savedAt)) {
          return null;
        }
        if (Date.now() - parsed.savedAt > CAP_POLICY_CACHE_MAX_AGE_MS) {
          return null;
        }
        return normalizeCapPolicy(parsed.policy);
      } catch (error) {
        return null;
      }
    }

    function writeCachedCapPolicy(policy) {
      storage.set(
        CAP_POLICY_CACHE_KEY,
        JSON.stringify({
          savedAt: Date.now(),
          policy
        })
      );
    }

    function initializeCachedCapPolicy() {
      if (hasInitializedCachedCapPolicy) {
        return;
      }
      hasInitializedCachedCapPolicy = true;
      const cached = readCachedCapPolicy();
      if (cached) {
        activeCapPolicy = cached;
        capPolicyLoadedAt = Date.now();
      }
    }

    function getConfiguredPolicyServerUrl() {
      const configRaw = storage.get('ccSubcapSyncConfig', '{}');
      if (!configRaw) {
        return '';
      }
      try {
        const parsed = JSON.parse(configRaw);
        if (typeof parsed?.serverUrl === 'string' && parsed.serverUrl.trim()) {
          return parsed.serverUrl.trim();
        }
      } catch (error) {
        return '';
      }
      return '';
    }

    async function fetchCapPolicyFromBackend(serverUrl) {
      validateServerUrl(serverUrl);
      const client = new ApiClient(serverUrl);
      const policy = await client.request('/meta/cap-policy', {
        method: 'GET'
      });
      return normalizeCapPolicy(policy);
    }

    async function ensureCapPolicyLoaded(force = false) {
      initializeCachedCapPolicy();
      if (!force && capPolicyLoadedAt && Date.now() - capPolicyLoadedAt < CAP_POLICY_REFRESH_INTERVAL_MS) {
        return activeCapPolicy;
      }
      if (capPolicyLoadPromise) {
        return capPolicyLoadPromise;
      }

      const serverUrl = getConfiguredPolicyServerUrl();
      if (!serverUrl) {
        capPolicyLoadedAt = Date.now();
        return activeCapPolicy;
      }

      capPolicyLoadPromise = (async () => {
        try {
          const policy = await fetchCapPolicyFromBackend(serverUrl);
          activeCapPolicy = policy;
          capPolicyLoadedAt = Date.now();
          writeCachedCapPolicy(policy);
          return policy;
        } catch (error) {
          const cached = readCachedCapPolicy();
          if (cached) {
            activeCapPolicy = cached;
          } else {
            activeCapPolicy = normalizeCapPolicy(EMBEDDED_CAP_POLICY);
          }
          capPolicyLoadedAt = Date.now();
          return activeCapPolicy;
        } finally {
          capPolicyLoadPromise = null;
        }
      })();

      return capPolicyLoadPromise;
    }

    function getCardCapPolicy(cardName, policy = activeCapPolicy) {
      return policy.cards?.[cardName] || { mode: 'per-category', cap: 0 };
    }

    function getParsedDate(entry) {
      if (!entry) return null;
      return fromISODate(entry.posting_date_iso) || parsePostingDate(entry.posting_date);
    }

    const storage = {
      get(key, fallback) {
        try {
          if (typeof GM_getValue === 'function') {
            return GM_getValue(key, fallback);
          }
        } catch (error) {
          // ignore
        }
        const stored = window.localStorage.getItem(key);
        return stored ?? fallback;
      },
      set(key, value) {
        try {
          if (typeof GM_setValue === 'function') {
            GM_setValue(key, value);
            return;
          }
        } catch (error) {
          // ignore
        }
        window.localStorage.setItem(key, value);
      }
    };

    // Phase 3: Initialize sync manager
    const syncManager = new SyncManager(storage);
    let stopTableObserver = null;

    function loadSettings() {
      const raw = storage.get(STORAGE_KEY, '{}');
      try {
        return JSON.parse(raw || '{}');
      } catch (error) {
        return {};
      }
    }

    function saveSettings(settings) {
      storage.set(STORAGE_KEY, JSON.stringify(settings));
    }

    function ensureCardSettings(settings, cardName, cardConfig) {
      if (!settings.cards) {
        settings.cards = {};
      }
      if (!settings.cards[cardName]) {
        settings.cards[cardName] = {
          selectedCategories: Array.from({ length: cardConfig.subcapSlots }, () => ''),
          defaultCategory: 'Others',
          merchantMap: {},
          transactions: {}
        };
      }

      const cardSettings = settings.cards[cardName];
      if (!Array.isArray(cardSettings.selectedCategories)) {
        cardSettings.selectedCategories = Array.from({ length: cardConfig.subcapSlots }, () => '');
      }

      if (cardSettings.selectedCategories.length !== cardConfig.subcapSlots) {
        cardSettings.selectedCategories = Array.from({ length: cardConfig.subcapSlots }, (_, index) => {
          return cardSettings.selectedCategories[index] || '';
        });
      }

      cardSettings.selectedCategories = cardSettings.selectedCategories.map((value) => {
        return cardConfig.categories.includes(value) ? value : '';
      });

      const allowedDefaults = new Set(getSelectedCategories(cardSettings).filter(Boolean));
      allowedDefaults.add('Others');
      if (!allowedDefaults.has(cardSettings.defaultCategory)) {
        cardSettings.defaultCategory = 'Others';
      }

      if (!cardSettings.merchantMap || typeof cardSettings.merchantMap !== 'object') {
        cardSettings.merchantMap = {};
      }
      if (!cardSettings.transactions || typeof cardSettings.transactions !== 'object') {
        cardSettings.transactions = {};
      }

      return cardSettings;
    }

    function removeUI() {
      if (stopTableObserver) {
        stopTableObserver();
        stopTableObserver = null;
      }
      const button = document.getElementById(UI_IDS.button);
      if (button) {
        button.remove();
      }
      const overlay = document.getElementById(UI_IDS.overlay);
      if (overlay) {
        overlay.remove();
      }
    }

    function evalXPath(xpath, contextNode = document) {
      try {
        return document.evaluate(
          xpath,
          contextNode,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        ).singleNodeValue;
      } catch (error) {
        return null;
      }
    }

    function waitForXPath(xpath, timeoutMs = 15000) {
      return new Promise((resolve) => {
        const existing = evalXPath(xpath);
        if (existing) {
          resolve(existing);
          return;
        }

        const observer = new MutationObserver(() => {
          const node = evalXPath(xpath);
          if (node) {
            observer.disconnect();
            resolve(node);
          }
        });

        observer.observe(document.documentElement, { childList: true, subtree: true });

        window.setTimeout(() => {
          observer.disconnect();
          resolve(null);
        }, timeoutMs);
      });
    }

    async function waitForTableBodyRows(xpath, timeoutMs = 15000, settleMs = 2000) {
      const tbody = await waitForXPath(xpath, timeoutMs);
      if (!tbody) {
        return null;
      }
      const startTime = Date.now();
      while (Date.now() - startTime < settleMs) {
        const rowCount = tbody.querySelectorAll('tr').length;
        if (rowCount > 0) {
          return tbody;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 200));
      }
      return tbody;
    }

    async function waitForAnyXPath(xpaths, timeoutMs = 15000) {
      const candidates = Array.isArray(xpaths) ? xpaths.filter(Boolean) : [xpaths];
      if (!candidates.length) {
        return null;
      }
      const getMatch = () => {
        for (const xpath of candidates) {
          const node = evalXPath(xpath);
          if (node) {
            return { xpath, node };
          }
        }
        return null;
      };

      return new Promise((resolve) => {
        const existingMatch = getMatch();
        if (existingMatch) {
          resolve(existingMatch);
          return;
        }

        const observer = new MutationObserver(() => {
          const match = getMatch();
          if (match) {
            observer.disconnect();
            resolve(match);
          }
        });

        observer.observe(document.documentElement, { childList: true, subtree: true });
        window.setTimeout(() => {
          observer.disconnect();
          resolve(null);
        }, timeoutMs);
      });
    }

    async function waitForAnyTableBodyRows(xpaths, timeoutMs = 15000, settleMs = 2000) {
      const candidates = Array.isArray(xpaths) ? xpaths.filter(Boolean) : [xpaths];
      if (!candidates.length) {
        return null;
      }

      const startedAt = Date.now();
      let fallback = null;
      while (Date.now() - startedAt < timeoutMs) {
        for (const xpath of candidates) {
          const tbody = evalXPath(xpath);
          if (!tbody) {
            continue;
          }
          fallback = fallback || { xpath, tbody };
          if (tbody.querySelectorAll('tr').length > 0) {
            return { xpath, tbody };
          }
        }
        await new Promise((resolve) => window.setTimeout(resolve, 200));
      }

      if (fallback) {
        const waitStart = Date.now();
        while (Date.now() - waitStart < settleMs) {
          if (fallback.tbody.querySelectorAll('tr').length > 0) {
            return fallback;
          }
          await new Promise((resolve) => window.setTimeout(resolve, 200));
        }
      }

      return fallback;
    }

    function observeTableBody(tableBodyXPaths, onChange) {
      let currentTbody = null;
      let tableObserver = null;
      let refreshTimer = null;

      const scheduleRefresh = () => {
        if (refreshTimer) {
          window.clearTimeout(refreshTimer);
        }
        refreshTimer = window.setTimeout(onChange, 400);
      };

      const attachObserver = (tbody) => {
        if (tableObserver) {
          tableObserver.disconnect();
        }
        tableObserver = new MutationObserver((mutations) => {
          const hasChange = mutations.some((mutation) => mutation.type === 'childList');
          if (hasChange) {
            scheduleRefresh();
          }
        });
        tableObserver.observe(tbody, { childList: true, subtree: true });
      };

      const ensureObserver = async () => {
        const match = await waitForAnyXPath(tableBodyXPaths, 15000);
        const tbody = match?.node || null;
        if (!tbody || tbody === currentTbody) {
          return;
        }
        currentTbody = tbody;
        attachObserver(tbody);
        scheduleRefresh();
      };

      ensureObserver();

      const rootObserver = new MutationObserver(() => {
        if (!currentTbody || !currentTbody.isConnected) {
          ensureObserver();
        }
      });

      rootObserver.observe(document.documentElement, { childList: true, subtree: true });

      return () => {
        if (tableObserver) {
          tableObserver.disconnect();
        }
        rootObserver.disconnect();
        if (refreshTimer) {
          window.clearTimeout(refreshTimer);
        }
      };
    }

    function normalizeText(value) {
      return (value || '').replace(/\s+/g, ' ').trim();
    }

    function matchesProfile(profile) {
      if (!profile) {
        return false;
      }
      const hostMatches = profile.host
        ? window.location.hostname === profile.host
        : (profile.urlPrefix ? window.location.href.startsWith(profile.urlPrefix) : true);
      if (!hostMatches) {
        return false;
      }
      if (profile.pathPrefix && !window.location.pathname.startsWith(profile.pathPrefix)) {
        return false;
      }
      return true;
    }

    function findAnyTableBody(xpaths) {
      const candidates = Array.isArray(xpaths) ? xpaths.filter(Boolean) : [xpaths];
      for (const xpath of candidates) {
        const tbody = evalXPath(xpath);
        if (tbody) {
          return { xpath, tbody };
        }
      }
      return null;
    }

    function resolveSupportedCardName(rawCardName) {
      if (CARD_CONFIGS[rawCardName]) {
        return rawCardName;
      }
      if (/\bXL\s*REWARDS\b/i.test(rawCardName)) {
        return 'XL Rewards Card';
      }
      return Object.keys(CARD_CONFIGS).find((name) => rawCardName.toUpperCase().includes(name.toUpperCase())) || '';
    }

    function extractMerchantInfo(cell) {
      if (!cell) {
        return { merchantName: '', refNo: '' };
      }
      const raw = cell.innerText || cell.textContent || '';
      const lines = raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      if (lines.length > 0) {
        return {
          merchantName: lines[0],
          refNo: normalizeRefNo(lines.length > 1 ? lines[1] : '')
        };
      }
      return { merchantName: normalizeText(raw), refNo: '' };
    }

    function toISODate(date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    function fromISODate(value) {
      if (!value) {
        return null;
      }
      const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) {
        return null;
      }
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      if (!year || !month || !day) {
        return null;
      }
      const date = new Date(year, month - 1, day);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    function parsePostingDate(value) {
      const raw = normalizeText(value).replace(/,/g, '');
      if (!raw) {
        return null;
      }
      const textMatch = raw.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
      if (!textMatch) {
        return null;
      }
      const day = Number(textMatch[1]);
      const monthName = textMatch[2].toLowerCase();
      const year = Number(textMatch[3]);
      const monthMap = {
        jan: 0,
        feb: 1,
        mar: 2,
        apr: 3,
        may: 4,
        jun: 5,
        jul: 6,
        aug: 7,
        sep: 8,
        oct: 9,
        nov: 10,
        dec: 11
      };
      if (!Object.prototype.hasOwnProperty.call(monthMap, monthName)) {
        return null;
      }
      const date = new Date(year, monthMap[monthName], day);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    function getCalendarCutoffDate(months) {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth() - months, 1);
    }

    function isWithinCutoff(date, cutoff) {
      return date && !Number.isNaN(date.getTime()) && date >= cutoff;
    }

    function normalizeKey(value) {
      return normalizeText(value);
    }

    function normalizeRefNo(value) {
      const raw = normalizeText(value);
      if (!raw) {
        return '';
      }
      return raw.replace(/^ref\s*no\s*:\s*/i, '');
    }

    function parseAmount(amountText) {
      if (!amountText) {
        return null;
      }
      const normalized = amountText.replace(/[^0-9.-]/g, '');
      if (!normalized) {
        return null;
      }
      const number = Number(normalized);
      return Number.isNaN(number) ? null : number;
    }

    function hashFNV1a(value) {
      const text = String(value || '');
      let hash = 0x811c9dc5;
      for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
      }
      return (hash >>> 0).toString(16).padStart(8, '0');
    }

    function buildMaybankSyntheticRefNo(postingDateIso, description, amountValue) {
      const normalizedDate = normalizeText(postingDateIso);
      const normalizedDesc = normalizeText(description).toUpperCase();
      const normalizedAmount =
        typeof amountValue === 'number' && Number.isFinite(amountValue) ? amountValue.toFixed(2) : '';
      const base = `${normalizedDate}|${normalizedDesc}|${normalizedAmount}`;
      const hash = hashFNV1a(base);
      return `MB:${normalizedDate}:${normalizedAmount}:${hash}`;
    }

    function extractDollarsAndCents(amountCell) {
      if (!amountCell) {
        return { dollarsText: '', centsText: '', amountText: '' };
      }

      const amountSpan = amountCell.querySelector('span');
      if (!amountSpan) {
        const fallback = normalizeText(amountCell.textContent);
        return { dollarsText: fallback, centsText: '', amountText: fallback };
      }

      const centsSpan = amountSpan.querySelector('span');
      const centsText = normalizeText(centsSpan ? centsSpan.textContent : '');

      let dollarsText = '';
      const firstTextNode = Array.from(amountSpan.childNodes).find(
        (node) => node.nodeType === Node.TEXT_NODE
      );

      if (firstTextNode) {
        dollarsText = normalizeText(firstTextNode.textContent);
      } else {
        dollarsText = normalizeText(amountSpan.textContent);
        if (centsText && dollarsText.endsWith(centsText)) {
          dollarsText = normalizeText(dollarsText.slice(0, -centsText.length));
        }
      }

      const amountText = `${dollarsText}${centsText}`.trim();
      return { dollarsText, centsText, amountText };
    }

    function getSelectedCategories(cardSettings) {
      return (cardSettings.selectedCategories || []).slice();
    }

    function getDefaultCategoryOptions(cardSettings) {
      const options = getSelectedCategories(cardSettings).filter(Boolean);
      options.push('Others');
      return Array.from(new Set(options));
    }

    function getMappingOptions(cardSettings, currentValue) {
      const options = getDefaultCategoryOptions(cardSettings);
      if (currentValue && !options.includes(currentValue)) {
        options.push(currentValue);
      }
      return options;
    }

    function hasUnescapedWildcard(pattern) {
      if (typeof pattern !== 'string') {
        return false;
      }
      let escapeNext = false;
      for (let i = 0; i < pattern.length; i += 1) {
        const char = pattern[i];
        if (escapeNext) {
          escapeNext = false;
          continue;
        }
        if (char === '\\') {
          escapeNext = true;
          continue;
        }
        if (char === '*') {
          return true;
        }
      }
      return false;
    }

    function escapeRegexChar(char) {
      return /[\\^$.*+?()[\]{}|]/.test(char) ? `\\${char}` : char;
    }

    function buildWildcardRegex(pattern) {
      let regexSource = '';
      let escapeNext = false;
      for (let i = 0; i < pattern.length; i += 1) {
        const char = pattern[i];
        if (escapeNext) {
          regexSource += escapeRegexChar(char);
          escapeNext = false;
          continue;
        }
        if (char === '\\') {
          escapeNext = true;
          continue;
        }
        if (char === '*') {
          regexSource += '[^*]*';
          continue;
        }
        regexSource += escapeRegexChar(char);
      }
      if (escapeNext) {
        regexSource += '\\\\';
      }
      return new RegExp(`^${regexSource}$`, 'i');
    }

    /**
     * Checks if a merchant name matches a pattern with wildcard support.
     * Supports '*' as a wildcard character that matches any sequence of characters except literal '*'.
     * Use '\\*' to match a literal asterisk.
     * @param {string} merchantName - The merchant name to match
     * @param {string} pattern - The pattern to match against (may contain wildcards)
     * @returns {boolean} True if the merchant name matches the pattern
     */
    function matchesWildcard(merchantName, pattern) {
      // Handle null/undefined and non-string inputs defensively
      if (typeof merchantName !== 'string' || typeof pattern !== 'string') {
        return false;
      }

      if (!hasUnescapedWildcard(pattern)) {
        return false;
      }

      const regex = buildWildcardRegex(pattern);
      return regex.test(merchantName);
    }

    function resolveCategory(merchantName, cardSettings, cardName = '') {
      if (!merchantName) {
        return cardSettings.defaultCategory || 'Others';
      }
      
      if (cardSettings.merchantMap) {
        // First try exact match for backward compatibility and performance
        if (cardSettings.merchantMap[merchantName]) {
          return cardSettings.merchantMap[merchantName];
        }
        
        // Then try case-insensitive exact matching
        const normalizedName = merchantName.toUpperCase();
        const hasLiteralAsterisk = merchantName.includes('*');
        for (const [pattern, category] of Object.entries(cardSettings.merchantMap)) {
          if ((!hasUnescapedWildcard(pattern) || hasLiteralAsterisk) && pattern.toUpperCase() === normalizedName) {
            return category;
          }
        }
        
        // Then try wildcard matching (only check patterns with wildcards).
        // NOTE: Patterns are evaluated in the insertion order of cardSettings.merchantMap.
        // The first matching pattern in that order wins, so define merchantMap entries
        // in priority order when using overlapping wildcard patterns.
        for (const [pattern, category] of Object.entries(cardSettings.merchantMap)) {
          if (hasUnescapedWildcard(pattern) && matchesWildcard(merchantName, pattern)) {
            return category; // Return immediately on first match in insertion order
          }
        }
      }
      
      if (cardName === 'XL Rewards Card') {
        const normalized = normalizeText(merchantName);
        return /\bSGP$/i.test(normalized) ? 'Local' : 'Forex';
      }

      return cardSettings.defaultCategory || 'Others';
    }

    function buildMaybankTransactions(tbody, cardName, cardSettings) {
      const rows = Array.from(tbody.querySelectorAll('tr'));
      const diagnostics = {
        skipped_rows: 0,
        non_debit_rows: 0,
        invalid_posting_date: 0,
        invalid_amount: 0,
        missing_ref_no: 0
      };

      const transactions = rows
        .map((row, index) => {
          const cells = row.querySelectorAll('td');
          if (cells.length < 3) {
            diagnostics.skipped_rows += 1;
            return null;
          }

          const postingDate = normalizeText(cells[0].textContent);
          const description = normalizeText(cells.length >= 3 ? cells[2].textContent : '');
          const amountTextCandidate = Array.from(cells)
            .map((cell) => normalizeText(cell.textContent))
            .find((value) => /SGD/i.test(value));
          const amountText = amountTextCandidate || normalizeText(cells[cells.length - 1].textContent);

          if (!/^\s*-/.test(amountText)) {
            diagnostics.non_debit_rows += 1;
            return null;
          }

          const postingDateParsed = parsePostingDate(postingDate);
          if (postingDate && !postingDateParsed) {
            diagnostics.invalid_posting_date += 1;
          }
          const postingDateIso = postingDateParsed ? toISODate(postingDateParsed) : '';

          const amountValueRaw = parseAmount(amountText);
          const amountValue =
            amountValueRaw === null ? null : Math.abs(amountValueRaw);
          if (amountText && amountValue === null) {
            diagnostics.invalid_amount += 1;
            return null;
          }

          if (!postingDate || !description || !postingDateIso || typeof amountValue !== 'number') {
            diagnostics.skipped_rows += 1;
            return null;
          }

          const refNo = buildMaybankSyntheticRefNo(postingDateIso, description, amountValue);
          const category = resolveCategory(description, cardSettings, cardName);

          return {
            row_index: index + 1,
            posting_date: postingDate,
            posting_date_iso: postingDateIso,
            transaction_date: '',
            merchant_detail: description,
            ref_no: refNo,
            amount_dollars: '',
            amount_cents: '',
            amount_text: amountText,
            amount_value: amountValue,
            category
          };
        })
        .filter(Boolean);

      return { transactions, diagnostics };
    }

    function buildTransactions(tbody, cardName, cardSettings) {
      if (cardName === 'XL Rewards Card') {
        return buildMaybankTransactions(tbody, cardName, cardSettings);
      }
      const rows = Array.from(tbody.querySelectorAll('tr'));
      const diagnostics = {
        skipped_rows: 0,
        missing_ref_no: 0,
        invalid_posting_date: 0,
        invalid_amount: 0
      };

      const transactions = rows
        .map((row, index) => {
          const cells = row.querySelectorAll('td');
          if (cells.length < 4) {
            diagnostics.skipped_rows += 1;
            return null;
          }

          const postingDate = normalizeText(cells[0].textContent);
          const transactionDate = normalizeText(cells[1].textContent);
          const { merchantName, refNo } = extractMerchantInfo(cells[2]);
          const normalizedRefNo = normalizeKey(normalizeRefNo(refNo));

          if (
            !postingDate &&
            !transactionDate &&
            merchantName.toLowerCase() === 'previous balance'
          ) {
            diagnostics.skipped_rows += 1;
            return null;
          }
          if (!normalizedRefNo) {
            diagnostics.missing_ref_no += 1;
            return null;
          }

          const { dollarsText, centsText, amountText } = extractDollarsAndCents(cells[3]);
          const amountValue = parseAmount(amountText);
          if (amountText && amountValue === null) {
            diagnostics.invalid_amount += 1;
          }

          const postingDateParsed = parsePostingDate(postingDate);
          if (postingDate && !postingDateParsed) {
            diagnostics.invalid_posting_date += 1;
          }

          const postingDateIso = postingDateParsed ? toISODate(postingDateParsed) : '';
          const category = resolveCategory(merchantName, cardSettings, cardName);

          return {
            row_index: index + 1,
            posting_date: postingDate,
            posting_date_iso: postingDateIso,
            transaction_date: transactionDate,
            merchant_detail: merchantName,
            ref_no: normalizedRefNo,
            amount_dollars: dollarsText,
            amount_cents: centsText,
            amount_text: amountText,
            amount_value: amountValue,
            category
          };
        })
        .filter(Boolean);

      return { transactions, diagnostics };
    }

    function calculateSummary(transactions, cardSettings) {
      const totals = {};
      let totalAmount = 0;

      transactions.forEach((transaction) => {
        if (typeof transaction.amount_value !== 'number') {
          return;
        }
        const category = transaction.category || cardSettings.defaultCategory || 'Others';
        totals[category] = (totals[category] || 0) + transaction.amount_value;
        totalAmount += transaction.amount_value;
      });

      return {
        totals,
        total_amount: totalAmount,
        transaction_count: transactions.length
      };
    }

    function buildData(tableBody, cardName, cardSettings) {
      const { transactions, diagnostics } = buildTransactions(tableBody, cardName, cardSettings);
      const summary = calculateSummary(transactions, cardSettings);

      return {
        card_name: cardName,
        source_url: window.location.href,
        extracted_at: new Date().toISOString(),
        selected_categories: getSelectedCategories(cardSettings).filter(Boolean),
        default_category: cardSettings.defaultCategory,
        summary,
        diagnostics,
        transactions
      };
    }

    function buildFallbackData(cardName, cardSettings) {
      const transactions = [];
      return {
        card_name: cardName,
        source_url: window.location.href,
        extracted_at: new Date().toISOString(),
        selected_categories: getSelectedCategories(cardSettings).filter(Boolean),
        default_category: cardSettings.defaultCategory,
        summary: calculateSummary(transactions, cardSettings),
        diagnostics: {
          skipped_rows: 0,
          missing_ref_no: 0,
          invalid_posting_date: 0,
          invalid_amount: 0,
          non_debit_rows: 0
        },
        transactions
      };
    }

    function updateStoredTransactions(settings, cardName, cardConfig, transactions) {
      const cardSettings = ensureCardSettings(settings, cardName, cardConfig);
      const cutoff = getCalendarCutoffDate(3);
      const nextStored = {};

      Object.keys(cardSettings.transactions || {}).forEach((refNo) => {
        const entry = cardSettings.transactions[refNo];
        const parsedDate = getParsedDate(entry);
        if (parsedDate && isWithinCutoff(parsedDate, cutoff)) {
          nextStored[refNo] = entry;
        }
      });

      transactions.forEach((tx) => {
        if (!tx.ref_no) {
          return;
        }
        const parsedDate = getParsedDate(tx);
        if (!parsedDate || !isWithinCutoff(parsedDate, cutoff)) {
          return;
        }
        const key = normalizeKey(tx.ref_no);
        if (!key) {
          return;
        }
        nextStored[key] = {
          ref_no: key,
          posting_date: tx.posting_date,
          posting_date_iso: tx.posting_date_iso || toISODate(parsedDate),
          transaction_date: tx.transaction_date,
          merchant_detail: tx.merchant_detail,
          amount_text: tx.amount_text,
          amount_value: tx.amount_value,
          category: tx.category
        };
      });

      cardSettings.transactions = nextStored;
    }

    function getStoredTransactions(cardName, cardSettings) {
      const stored = cardSettings.transactions || {};
      const deduped = {};

      Object.keys(stored).forEach((key) => {
        const entry = stored[key] || {};
        const normalizedRefNo = normalizeKey(normalizeRefNo(entry.ref_no || key));
        if (!normalizedRefNo) {
          return;
        }

        const merchantDetail = normalizeText(entry.merchant_detail || '');
        const parsedDate = getParsedDate(entry);
        const postingDateIso = entry.posting_date_iso || (parsedDate ? toISODate(parsedDate) : '');
        const amountValue =
          typeof entry.amount_value === 'number'
            ? entry.amount_value
            : parseAmount(entry.amount_text || '');
        const category = resolveCategory(merchantDetail, cardSettings, cardName);

        const normalizedEntry = {
          ...entry,
          ref_no: normalizedRefNo,
          merchant_detail: merchantDetail,
          posting_date_iso: postingDateIso,
          posting_month: postingDateIso ? postingDateIso.slice(0, 7) : '',
          amount_value: amountValue,
          category
        };

        if (!deduped[normalizedRefNo]) {
          deduped[normalizedRefNo] = normalizedEntry;
          return;
        }

        const existing = deduped[normalizedRefNo];
        const existingDate = fromISODate(existing.posting_date_iso);
        const newDate = fromISODate(normalizedEntry.posting_date_iso);
        if (newDate && (!existingDate || newDate > existingDate)) {
          deduped[normalizedRefNo] = normalizedEntry;
        }
      });

      return Object.values(deduped);
    }

    function formatMonthLabel(monthKey) {
      const match = String(monthKey).match(/^(\d{4})-(\d{2})$/);
      if (!match) {
        return monthKey;
      }
      const year = match[1];
      const monthIndex = Number(match[2]) - 1;
      const monthNames = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec'
      ];
      if (!monthNames[monthIndex]) {
        return monthKey;
      }
      return `${monthNames[monthIndex]} ${year}`;
    }

    function calculateMonthlyTotals(transactions, cardSettings) {
      const totalsByMonth = {};

      transactions.forEach((transaction) => {
        if (!transaction.posting_month) {
          return;
        }
        if (typeof transaction.amount_value !== 'number') {
          return;
        }
        const monthKey = transaction.posting_month;
        if (!totalsByMonth[monthKey]) {
          totalsByMonth[monthKey] = { totals: {}, total_amount: 0 };
        }
        const category =
          transaction.category || cardSettings.defaultCategory || 'Others';
        totalsByMonth[monthKey].totals[category] =
          (totalsByMonth[monthKey].totals[category] || 0) + transaction.amount_value;
        totalsByMonth[monthKey].total_amount += transaction.amount_value;
      });

      return totalsByMonth;
    }

    function createButton(onClick) {
      if (document.getElementById(UI_IDS.button)) {
        return;
      }

      const button = document.createElement('button');
      button.id = UI_IDS.button;
      button.type = 'button';
      button.textContent = 'Subcap Tools';
      button.classList.add(UI_CLASSES.fab);
      button.addEventListener('click', onClick);

      document.body.appendChild(button);
    }

    function renderSummary(container, data, cardSettings) {
      container.innerHTML = '';

      const title = document.createElement('div');
      title.textContent = 'Totals in Statement Month (by category)';
      title.style.fontWeight = '600';
      title.style.marginBottom = '8px';
      title.style.color = THEME.accent;

      const list = document.createElement('div');
      list.style.display = 'grid';
      list.style.gridTemplateColumns = '1fr auto';
      list.style.rowGap = '6px';
      list.style.columnGap = '16px';

      const selected = getSelectedCategories(cardSettings).filter(Boolean);
      const order = [...selected, 'Others'];
      const totals = data.summary.totals || {};
      const extras = Object.keys(totals).filter((key) => !order.includes(key));
      order.push(...extras);

      order.forEach((category) => {
        if (!totals.hasOwnProperty(category)) {
          return;
        }
        const label = document.createElement('div');
        label.textContent = category;
        const value = document.createElement('div');
        value.textContent = totals[category].toFixed(2);
        list.appendChild(label);
        list.appendChild(value);
      });

      const totalRowLabel = document.createElement('div');
      totalRowLabel.style.marginTop = '8px';
      totalRowLabel.style.fontWeight = '600';
      totalRowLabel.textContent = 'Total';

      const totalRowValue = document.createElement('div');
      totalRowValue.style.marginTop = '8px';
      totalRowValue.style.fontWeight = '600';
      totalRowValue.style.color = THEME.accent;
      totalRowValue.textContent = data.summary.total_amount.toFixed(2);

      list.appendChild(totalRowLabel);
      list.appendChild(totalRowValue);

      container.appendChild(title);
      container.appendChild(list);

      const diagnostics = data.diagnostics || {};
      const issues = [
        {
          key: 'invalid_posting_date',
          label: 'Rows with unreadable posting dates'
        },
        {
          key: 'missing_ref_no',
          label: 'Rows skipped (missing ref no)'
        },
        {
          key: 'non_debit_rows',
          label: 'Rows skipped (non-debit / credits)'
        },
        {
          key: 'invalid_amount',
          label: 'Rows with unreadable amounts'
        },
        {
          key: 'skipped_rows',
          label: 'Rows skipped (missing cells or previous balance)'
        }
      ];

      const hasIssues = issues.some((issue) => diagnostics[issue.key] > 0);
      if (hasIssues) {
        const issueTitle = document.createElement('div');
        issueTitle.textContent = 'Data issues';
        issueTitle.style.marginTop = '12px';
        issueTitle.style.fontWeight = '600';
        issueTitle.style.color = THEME.warning;

        const issueList = document.createElement('div');
        issueList.style.display = 'grid';
        issueList.style.gridTemplateColumns = '1fr auto';
        issueList.style.rowGap = '6px';
        issueList.style.columnGap = '16px';
        issueList.style.background = THEME.warningSoft;
        issueList.style.border = `1px solid ${THEME.border}`;
        issueList.style.borderRadius = '8px';
        issueList.style.padding = '8px';

        issues.forEach((issue) => {
          const count = diagnostics[issue.key] || 0;
          if (!count) {
            return;
          }
          const label = document.createElement('div');
          label.textContent = issue.label;

          const value = document.createElement('div');
          value.textContent = String(count);

          issueList.appendChild(label);
          issueList.appendChild(value);
        });

        container.appendChild(issueTitle);
        container.appendChild(issueList);
      }
    }

    function renderCategorySelectors(container, cardSettings, cardConfig, onChange) {
      const title = document.createElement('div');
      title.textContent = `Select bonus categories (${cardConfig.subcapSlots})`;
      title.style.fontWeight = '600';
      title.style.color = THEME.accent;

      const wrapper = document.createElement('div');
      wrapper.style.display = 'grid';
      wrapper.style.gridTemplateColumns = '1fr 1fr';
      wrapper.style.gap = '12px';

      const selected = getSelectedCategories(cardSettings);

      for (let i = 0; i < cardConfig.subcapSlots; i += 1) {
        const select = document.createElement('select');
        select.style.padding = '6px 8px';
        select.style.borderRadius = '6px';
        select.style.border = `1px solid ${THEME.border}`;
        select.style.background = THEME.surface;
        select.style.color = THEME.text;

        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = 'Select category';
        select.appendChild(emptyOption);

        cardConfig.categories.forEach((category) => {
          const option = document.createElement('option');
          option.value = category;
          option.textContent = category;
          select.appendChild(option);
        });

        select.value = selected[i] || '';

        select.addEventListener('change', () => {
          const value = select.value;
          onChange((nextSettings) => {
            const updated = getSelectedCategories(nextSettings);
            updated[i] = value;
            for (let j = 0; j < updated.length; j += 1) {
              if (j !== i && value && updated[j] === value) {
                updated[j] = '';
              }
            }
            nextSettings.selectedCategories = updated;

            const allowedDefaults = new Set(getSelectedCategories(nextSettings).filter(Boolean));
            allowedDefaults.add('Others');
            if (!allowedDefaults.has(nextSettings.defaultCategory)) {
              nextSettings.defaultCategory = 'Others';
            }
          });
        });

        wrapper.appendChild(select);
      }

      container.appendChild(title);
      container.appendChild(wrapper);
    }

    function renderDefaultCategory(container, cardSettings, onChange) {
      const title = document.createElement('div');
      title.textContent = 'Default category';
      title.style.fontWeight = '600';
      title.style.color = THEME.accent;

      const select = document.createElement('select');
      select.style.padding = '6px 8px';
      select.style.borderRadius = '6px';
      select.style.border = `1px solid ${THEME.border}`;
      select.style.background = THEME.surface;
      select.style.color = THEME.text;

      const options = getDefaultCategoryOptions(cardSettings);
      options.forEach((category) => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        select.appendChild(option);
      });
      select.value = cardSettings.defaultCategory;

      select.addEventListener('change', () => {
        const value = select.value;
        onChange((nextSettings) => {
          nextSettings.defaultCategory = value;
        });
      });

      container.appendChild(title);
      container.appendChild(select);
    }

    function renderMerchantSection(container, titleText, merchants, cardSettings, onChange) {
      const title = document.createElement('div');
      title.textContent = titleText;
      title.style.fontWeight = '600';
      title.style.color = THEME.accent;

      const table = document.createElement('div');
      table.style.display = 'grid';
      table.style.gridTemplateColumns = '2fr 1fr';
      table.style.gap = '8px 12px';

      if (!merchants.length) {
        const empty = document.createElement('div');
        empty.textContent = 'None';
        empty.style.opacity = '0.7';
        container.appendChild(title);
        container.appendChild(empty);
        return;
      }

      merchants.forEach((merchant) => {
        const label = document.createElement('div');
        label.textContent = merchant;
        label.style.wordBreak = 'break-word';

        const select = document.createElement('select');
        select.style.padding = '6px 8px';
        select.style.borderRadius = '6px';
        select.style.border = `1px solid ${THEME.border}`;
        select.style.background = THEME.surface;
        select.style.color = THEME.text;

        const currentValue = cardSettings.merchantMap[merchant] || cardSettings.defaultCategory;
        const options = getMappingOptions(cardSettings, currentValue);

        options.forEach((category) => {
          const option = document.createElement('option');
          option.value = category;
          option.textContent = category;
          select.appendChild(option);
        });

        select.value = currentValue;

        select.addEventListener('change', () => {
          const value = select.value;
          onChange((nextSettings) => {
            nextSettings.merchantMap[merchant] = value;
          });
        });

        table.appendChild(label);
        table.appendChild(select);
      });

      container.appendChild(title);
      container.appendChild(table);
    }

    function renderMerchantMapping(container, transactions, cardSettings, onChange) {
      const merchantCounts = new Map();
      transactions.forEach((transaction) => {
        const merchant = transaction.merchant_detail;
        if (!merchant) {
          return;
        }
        merchantCounts.set(merchant, (merchantCounts.get(merchant) || 0) + 1);
      });
      const mappedMerchants = new Set(Object.keys(cardSettings.merchantMap || {}));
      const knownMerchants = new Set(merchantCounts.keys());
      Object.values(cardSettings.transactions || {}).forEach((entry) => {
        const merchant = entry?.merchant_detail || '';
        if (merchant) {
          knownMerchants.add(merchant);
        }
      });

      const uncategorized = Array.from(merchantCounts.entries())
        .filter(([merchant]) => !mappedMerchants.has(merchant))
        .sort((a, b) => {
          if (a[1] !== b[1]) {
            return b[1] - a[1];
          }
          return a[0].localeCompare(b[0]);
        })
        .map(([merchant]) => merchant);
      const categorized = Array.from(mappedMerchants).sort((a, b) => a.localeCompare(b));

      // Add manual wildcard pattern section
      const wildcardSection = document.createElement('div');
      wildcardSection.classList.add(UI_CLASSES.stack);
      
      const wildcardTitle = document.createElement('div');
      wildcardTitle.textContent = 'Add Wildcard Pattern';
      wildcardTitle.style.fontWeight = '600';
      wildcardTitle.style.color = THEME.accent;
      wildcardSection.appendChild(wildcardTitle);

      const wildcardHelp = document.createElement('div');
      wildcardHelp.textContent = 'Use * to match any characters except literal *. Use \\* to match an asterisk (e.g., KrisPay\\*Paradise*).';
      wildcardHelp.style.fontSize = '12px';
      wildcardHelp.style.color = THEME.muted;
      wildcardSection.appendChild(wildcardHelp);

      const wildcardForm = document.createElement('div');
      wildcardForm.style.display = 'grid';
      wildcardForm.style.gridTemplateColumns = '2fr 1fr auto';
      wildcardForm.style.gap = '8px';
      wildcardForm.style.alignItems = 'center';

      const patternInput = document.createElement('input');
      patternInput.type = 'text';
      patternInput.placeholder = 'e.g., STARBUCKS* or *GRAB*';
      patternInput.style.padding = '6px 8px';
      patternInput.style.borderRadius = '6px';
      patternInput.style.border = `1px solid ${THEME.border}`;
      patternInput.style.background = THEME.surface;
      patternInput.style.color = THEME.text;

      const categorySelect = document.createElement('select');
      categorySelect.style.padding = '6px 8px';
      categorySelect.style.borderRadius = '6px';
      categorySelect.style.border = `1px solid ${THEME.border}`;
      categorySelect.style.background = THEME.surface;
      categorySelect.style.color = THEME.text;

      const options = getMappingOptions(cardSettings, cardSettings.defaultCategory);
      options.forEach((category) => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        categorySelect.appendChild(option);
      });

      const addButton = document.createElement('button');
      addButton.type = 'button';
      addButton.textContent = 'Add';
      addButton.style.padding = '6px 12px';
      addButton.style.borderRadius = '6px';
      addButton.style.border = `1px solid ${THEME.accent}`;
      addButton.style.background = THEME.accent;
      addButton.style.color = '#ffffff';
      addButton.style.fontSize = '13px';
      addButton.style.fontWeight = '600';
      addButton.style.cursor = 'pointer';

      // Status message element
      const statusMessage = document.createElement('div');
      statusMessage.style.gridColumn = '1 / -1';
      statusMessage.style.fontSize = '12px';
      statusMessage.style.padding = '6px 8px';
      statusMessage.style.borderRadius = '6px';
      statusMessage.style.display = 'none';
      statusMessage.style.marginTop = '4px';

      const showStatus = (message, isSuccess) => {
        statusMessage.textContent = message;
        statusMessage.style.display = 'block';
        statusMessage.style.background = isSuccess ? THEME.successSoft : THEME.errorSoft;
        statusMessage.style.color = isSuccess ? THEME.success : THEME.errorText;
        statusMessage.style.border = `1px solid ${isSuccess ? THEME.successBorder : THEME.errorBorder}`;
        setTimeout(() => {
          statusMessage.style.display = 'none';
        }, 3000);
      };

      addButton.addEventListener('click', () => {
        const pattern = patternInput.value.trim();
        const category = categorySelect.value;
        
        if (!pattern) {
          patternInput.style.borderColor = THEME.error;
          showStatus('Please enter a pattern', false);
          return;
        }
        
        // Reset border color
        patternInput.style.borderColor = THEME.border;
        
        // Initialize merchantMap if it doesn't exist
        if (!cardSettings.merchantMap) {
          cardSettings.merchantMap = {};
        }
        
        if (cardSettings.merchantMap[pattern]) {
          if (!confirm(`Pattern "${pattern}" already exists. Overwrite?`)) {
            return;
          }
        }
        
        onChange((nextSettings) => {
          if (!nextSettings.merchantMap) {
            nextSettings.merchantMap = {};
          }
          nextSettings.merchantMap[pattern] = category;
        });
        
        patternInput.value = '';
        showStatus(`✓ Added: ${pattern} → ${category}`, true);
      });

      wildcardForm.appendChild(patternInput);
      wildcardForm.appendChild(categorySelect);
      wildcardForm.appendChild(addButton);
      wildcardForm.appendChild(statusMessage);
      wildcardSection.appendChild(wildcardForm);
      
      // Show existing wildcard patterns
      const wildcardPatterns = Object.entries(cardSettings.merchantMap || {})
        .filter(([pattern]) => hasUnescapedWildcard(pattern) && !knownMerchants.has(pattern))
        .sort((a, b) => a[0].localeCompare(b[0]));
      
      if (wildcardPatterns.length > 0) {
        const existingTitle = document.createElement('div');
        existingTitle.textContent = 'Existing Wildcard Patterns';
        existingTitle.style.fontWeight = '600';
        existingTitle.style.color = THEME.accent;
        wildcardSection.appendChild(existingTitle);
        
        const patternList = document.createElement('div');
        patternList.style.display = 'flex';
        patternList.style.flexDirection = 'column';
        patternList.style.gap = '6px';
        
        wildcardPatterns.forEach(([pattern, category]) => {
          const patternRow = document.createElement('div');
          patternRow.style.display = 'grid';
          patternRow.style.gridTemplateColumns = '2fr 1fr auto';
          patternRow.style.gap = '8px';
          patternRow.style.alignItems = 'center';
          patternRow.style.padding = '6px';
          patternRow.style.background = THEME.surface;
          patternRow.style.borderRadius = '6px';
          patternRow.style.border = `1px solid ${THEME.border}`;
          
          const patternLabel = document.createElement('div');
          patternLabel.textContent = pattern;
          patternLabel.style.wordBreak = 'break-word';
          patternLabel.style.fontFamily = 'monospace';
          
          const categoryLabel = document.createElement('div');
          categoryLabel.textContent = category;
          categoryLabel.style.color = THEME.muted;
          
          const deleteButton = document.createElement('button');
          deleteButton.type = 'button';
          deleteButton.textContent = 'Delete';
          deleteButton.style.padding = '4px 8px';
          deleteButton.style.borderRadius = '4px';
          deleteButton.style.border = `1px solid ${THEME.errorBorder}`;
          deleteButton.style.background = THEME.errorSoft;
          deleteButton.style.color = THEME.errorText;
          deleteButton.style.fontSize = '12px';
          deleteButton.style.fontWeight = '600';
          deleteButton.style.cursor = 'pointer';
          
          deleteButton.addEventListener('click', () => {
            if (!confirm(`Delete wildcard pattern "${pattern}"? This will remove the categorization rule.`)) {
              return;
            }
            onChange((nextSettings) => {
              delete nextSettings.merchantMap?.[pattern];
            });
          });
          
          patternRow.appendChild(patternLabel);
          patternRow.appendChild(categoryLabel);
          patternRow.appendChild(deleteButton);
          patternList.appendChild(patternRow);
        });
        
        wildcardSection.appendChild(patternList);
      }
      
      container.appendChild(wildcardSection);

      const wildcardDivider = document.createElement('div');
      wildcardDivider.classList.add(UI_CLASSES.divider);
      container.appendChild(wildcardDivider);

      // Add title and mass categorization button
      const uncategorizedHeader = document.createElement('div');
      uncategorizedHeader.style.display = 'flex';
      uncategorizedHeader.style.justifyContent = 'space-between';
      uncategorizedHeader.style.alignItems = 'center';
      
      const uncategorizedTitle = document.createElement('div');
      uncategorizedTitle.textContent = 'Transactions to categorize';
      uncategorizedTitle.style.fontWeight = '600';
      uncategorizedTitle.style.color = THEME.accent;
      
      const massActionButton = document.createElement('button');
      massActionButton.type = 'button';
      massActionButton.textContent = `Categorize all as default (${uncategorized.length})`;
      massActionButton.style.padding = '6px 12px';
      massActionButton.style.borderRadius = '6px';
      massActionButton.style.border = `1px solid ${THEME.accent}`;
      massActionButton.style.background = THEME.accent;
      massActionButton.style.color = '#ffffff';
      massActionButton.style.fontSize = '12px';
      massActionButton.style.fontWeight = '600';
      massActionButton.style.cursor = 'pointer';
      massActionButton.style.opacity = uncategorized.length > 0 ? '1' : '0.5';
      massActionButton.disabled = uncategorized.length === 0;
      
      massActionButton.addEventListener('click', () => {
        if (uncategorized.length === 0) {
          return;
        }
        
        onChange((nextSettings) => {
          uncategorized.forEach((merchant) => {
            nextSettings.merchantMap[merchant] = nextSettings.defaultCategory;
          });
        });
      });
      
      uncategorizedHeader.appendChild(uncategorizedTitle);
      uncategorizedHeader.appendChild(massActionButton);
      container.appendChild(uncategorizedHeader);

      // Render uncategorized merchants (without title since we added it above)
      const uncategorizedSection = document.createElement('div');
      if (!uncategorized.length) {
        const empty = document.createElement('div');
        empty.textContent = 'None';
        empty.style.opacity = '0.7';
        uncategorizedSection.appendChild(empty);
      } else {
        const table = document.createElement('div');
        table.style.display = 'grid';
        table.style.gridTemplateColumns = '2fr 1fr';
        table.style.gap = '8px 12px';

        uncategorized.forEach((merchant) => {
          const label = document.createElement('div');
          label.textContent = merchant;
          label.style.wordBreak = 'break-word';

          const select = document.createElement('select');
          select.style.padding = '6px 8px';
          select.style.borderRadius = '6px';
          select.style.border = `1px solid ${THEME.border}`;
          select.style.background = THEME.surface;
          select.style.color = THEME.text;

          const currentValue = cardSettings.merchantMap[merchant] || cardSettings.defaultCategory;
          const options = getMappingOptions(cardSettings, currentValue);

          options.forEach((category) => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            select.appendChild(option);
          });

          select.value = currentValue;

          select.addEventListener('change', () => {
            const value = select.value;
            onChange((nextSettings) => {
              nextSettings.merchantMap[merchant] = value;
            });
          });

          table.appendChild(label);
          table.appendChild(select);
        });
        
        uncategorizedSection.appendChild(table);
      }
      container.appendChild(uncategorizedSection);

      const divider = document.createElement('div');
      divider.classList.add(UI_CLASSES.divider);
      container.appendChild(divider);

      renderMerchantSection(
        container,
        'Categorized',
        categorized,
        cardSettings,
        onChange
      );
    }

    function renderManageView(container, data, storedTransactions, cardSettings, cardConfig, onChange) {
      container.innerHTML = '';
      container.classList.add(UI_CLASSES.tab, UI_CLASSES.stackLoose);

      const notice = document.createElement('div');
      notice.classList.add(UI_CLASSES.notice);
      notice.innerHTML = TRANSACTION_LOADING_NOTICE;

      const selectorsSection = document.createElement('div');
      selectorsSection.classList.add(UI_CLASSES.stack);

      renderCategorySelectors(selectorsSection, cardSettings, cardConfig, onChange);
      renderDefaultCategory(selectorsSection, cardSettings, onChange);

      const summarySection = document.createElement('div');
      summarySection.id = UI_IDS.summaryContent;
      summarySection.classList.add(UI_CLASSES.section);

      renderSummary(summarySection, data, cardSettings);

      const mappingSection = document.createElement('div');
      mappingSection.classList.add(UI_CLASSES.section, UI_CLASSES.stack);

      renderMerchantMapping(
        mappingSection,
        storedTransactions || [],
        cardSettings,
        onChange
      );

      container.appendChild(notice);
      container.appendChild(selectorsSection);
      container.appendChild(summarySection);
      container.appendChild(mappingSection);
    }

    function renderSpendingView(container, storedTransactions, cardSettings, cardName, capPolicy = activeCapPolicy) {
      container.innerHTML = '';
      container.classList.add(UI_CLASSES.tab, UI_CLASSES.stackLoose);
      const normalizedPolicy = normalizeCapPolicy(capPolicy);
      const cardCapPolicy = getCardCapPolicy(cardName, normalizedPolicy);

      const title = document.createElement('div');
      title.classList.add(UI_CLASSES.title);
      title.textContent = 'Spend Totals (Last 3 Calendar Months)';

      const subtitle = document.createElement('div');
      subtitle.classList.add(UI_CLASSES.small);
      subtitle.textContent = 'Grouped by posting month using local stored transactions.';

      const notice = document.createElement('div');
      notice.classList.add(UI_CLASSES.notice);
      notice.innerHTML = TRANSACTION_LOADING_NOTICE;

      container.appendChild(title);
      container.appendChild(subtitle);
      container.appendChild(notice);

      const monthlyTotals = calculateMonthlyTotals(storedTransactions, cardSettings);
      const months = Object.keys(monthlyTotals).sort((a, b) => b.localeCompare(a));

      const transactionsByMonth = {};
      storedTransactions.forEach((tx) => {
        if (!tx.posting_month) {
          return;
        }
        if (!transactionsByMonth[tx.posting_month]) {
          transactionsByMonth[tx.posting_month] = [];
        }
        transactionsByMonth[tx.posting_month].push(tx);
      });

      if (!months.length) {
        const empty = document.createElement('div');
        empty.classList.add(UI_CLASSES.meta);
        empty.textContent = 'No stored transactions yet.';
        container.appendChild(empty);
        return;
      }

      months.forEach((monthKey) => {
        const monthData = monthlyTotals[monthKey];
        const monthTransactions = transactionsByMonth[monthKey] || [];
        const grouped = {};
        const monthTotalAmount =
          typeof monthData?.total_amount === 'number' && Number.isFinite(monthData.total_amount)
            ? monthData.total_amount
            : 0;

        monthTransactions.forEach((tx) => {
          const category = tx.category || cardSettings.defaultCategory || 'Others';
          if (!grouped[category]) {
            grouped[category] = { total: 0, transactions: [] };
          }
          if (typeof tx.amount_value === 'number') {
            grouped[category].total += tx.amount_value;
          }
          grouped[category].transactions.push(tx);
        });

        const baseCategories = getSelectedCategories(cardSettings).filter(Boolean);
        baseCategories.push('Others');
        const extraCategories = Object.keys(grouped).filter(
          (category) => !baseCategories.includes(category)
        );
        const categoryOrder = baseCategories.concat(extraCategories);

        const card = document.createElement('div');
        card.classList.add(UI_CLASSES.card, UI_CLASSES.stack);
        const monthHeader = document.createElement('div');
        monthHeader.classList.add(UI_CLASSES.spendMonthHeader);

        const monthLabel = document.createElement('div');
        monthLabel.textContent = formatMonthLabel(monthKey);

        const totalPill = document.createElement('div');
        totalPill.classList.add(UI_CLASSES.spendMonthTotal);
        totalPill.textContent = `Total ${monthTotalAmount.toFixed(2)}`;
        if (cardCapPolicy.mode === 'combined' && cardCapPolicy.cap > 0) {
          const severity = getCapSeverity(monthTotalAmount, cardCapPolicy.cap, normalizedPolicy);
          totalPill.classList.add(UI_CLASSES.spendCapBadge);
          totalPill.textContent = `Total ${monthTotalAmount.toFixed(2)} / ${cardCapPolicy.cap.toFixed(0)}`;
          applyCapToneStyles(totalPill, severity, normalizedPolicy, true);
        }

        monthHeader.appendChild(monthLabel);
        monthHeader.appendChild(totalPill);
        card.appendChild(monthHeader);

        const totalsList = document.createElement('div');
        totalsList.classList.add(UI_CLASSES.spendTotalsList);
        categoryOrder.forEach((category) => {
          const value = monthData.totals?.[category] || 0;
          const label = document.createElement('div');
          label.textContent = category;
          const amountWrap = document.createElement('div');
          amountWrap.classList.add(UI_CLASSES.spendAmountWrap);
          const amount = document.createElement('span');
          amount.textContent = value.toFixed(2);
          amountWrap.appendChild(amount);

          if (cardCapPolicy.mode === 'per-category' && cardCapPolicy.cap > 0) {
            const severity = getCapSeverity(value, cardCapPolicy.cap, normalizedPolicy);
            const capBadge = document.createElement('span');
            capBadge.classList.add(UI_CLASSES.spendCapBadge);
            capBadge.textContent = `${value.toFixed(2)} / ${cardCapPolicy.cap.toFixed(0)}`;
            applyCapToneStyles(amount, severity, normalizedPolicy, false);
            applyCapToneStyles(capBadge, severity, normalizedPolicy, true);
            amountWrap.appendChild(capBadge);
          }

          totalsList.appendChild(label);
          totalsList.appendChild(amountWrap);
        });
        card.appendChild(totalsList);

        const details = document.createElement('details');
        details.classList.add(UI_CLASSES.section, UI_CLASSES.sectionAccent, UI_CLASSES.spendDetailsToggle);
        const summary = document.createElement('summary');
        const chevron = document.createElement('span');
        chevron.classList.add(UI_CLASSES.spendChevron);
        chevron.setAttribute('aria-hidden', 'true');
        const summaryText = document.createElement('span');
        summaryText.textContent = 'View transactions';
        summary.appendChild(chevron);
        summary.appendChild(summaryText);
        details.appendChild(summary);

        categoryOrder.forEach((category) => {
          const group = grouped[category];
          if (!group) {
            return;
          }
          const categoryHeader = document.createElement('div');
          categoryHeader.classList.add(UI_CLASSES.spendMonthHeader);
          const categoryLabel = document.createElement('strong');
          categoryLabel.textContent = category;
          const categoryTotal = document.createElement('strong');
          categoryTotal.textContent = group.total.toFixed(2);
          categoryHeader.appendChild(categoryLabel);
          categoryHeader.appendChild(categoryTotal);
          details.appendChild(categoryHeader);

          const table = document.createElement('div');
          table.classList.add(UI_CLASSES.spendDetailsTable);
          ['Merchant', 'Posting Date', 'Amount'].forEach((header) => {
            const headerNode = document.createElement('strong');
            headerNode.textContent = header;
            table.appendChild(headerNode);
          });

          const sortedTransactions = group.transactions.slice().sort((a, b) => {
            const dateA = getParsedDate(a);
            const dateB = getParsedDate(b);
            const timeA = dateA ? dateA.getTime() : 0;
            const timeB = dateB ? dateB.getTime() : 0;
            if (timeA !== timeB) {
              return timeB - timeA;
            }
            return (a.merchant_detail || '').localeCompare(b.merchant_detail || '');
          });

          sortedTransactions.forEach((tx) => {
            const merchantCell = document.createElement('div');
            merchantCell.textContent = tx.merchant_detail || '-';
            const dateCell = document.createElement('div');
            dateCell.textContent = tx.posting_date || '-';
            const amountCell = document.createElement('div');
            amountCell.textContent = typeof tx.amount_value === 'number' ? tx.amount_value.toFixed(2) : '-';
            table.appendChild(merchantCell);
            table.appendChild(dateCell);
            table.appendChild(amountCell);
          });

          details.appendChild(table);
        });

        card.appendChild(details);
        container.appendChild(card);
      });
    }

    let activeTabId = 'spend';
    let currentCardSupportsManage = false;

    function switchTab(tab) {
      const manageContent = document.getElementById(UI_IDS.manageContent);
      const spendContent = document.getElementById(UI_IDS.spendContent);
      const syncContent = document.getElementById(UI_IDS.syncContent);
      const tabManage = document.getElementById(UI_IDS.tabManage);
      const tabSpend = document.getElementById(UI_IDS.tabSpend);
      const tabSync = document.getElementById(UI_IDS.tabSync);

      if (!spendContent || !syncContent || !tabSpend || !tabSync) {
        return;
      }

      if (currentCardSupportsManage && tab === 'manage') {
        activeTabId = 'manage';
      } else if (tab === 'sync') {
        activeTabId = 'sync';
      } else {
        activeTabId = 'spend';
      }
      if (!currentCardSupportsManage && activeTabId === 'manage') {
        activeTabId = 'spend';
      }

      const isManage = activeTabId === 'manage';
      const isSpend = activeTabId === 'spend';
      const isSync = activeTabId === 'sync';

      if (manageContent) {
        manageContent.classList.toggle(UI_CLASSES.hidden, !isManage || !currentCardSupportsManage);
      }
      spendContent.classList.toggle(UI_CLASSES.hidden, !isSpend);
      syncContent.classList.toggle(UI_CLASSES.hidden, !isSync);
      if (tabManage) {
        tabManage.classList.toggle(UI_CLASSES.hidden, !currentCardSupportsManage);
        tabManage.classList.toggle(UI_CLASSES.tabButtonActive, isManage && currentCardSupportsManage);
      }
      tabSpend.classList.toggle(UI_CLASSES.tabButtonActive, isSpend);
      tabSync.classList.toggle(UI_CLASSES.tabButtonActive, isSync);
    }

    function createOverlay(
      data,
      settings,
      storedTransactions,
      cardName,
      cardConfig,
      cardSettings,
      onSyncStateChanged = () => {},
      shouldShow = false,
      capPolicy = activeCapPolicy
    ) {
      ensureUiStyles(THEME);
      let overlay = document.getElementById(UI_IDS.overlay);
      let manageContent;
      let spendContent;
      let syncContent;
      const wasVisible = overlay && !overlay.classList.contains(UI_CLASSES.hidden);
      currentCardSupportsManage = cardConfig?.showManageTab !== false;

      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = UI_IDS.overlay;
        overlay.classList.add(UI_CLASSES.overlay, UI_CLASSES.hidden);
        overlay.addEventListener('click', (event) => {
          if (event.target === overlay) {
            overlay.classList.add(UI_CLASSES.hidden);
          }
        });

        const panel = document.createElement('div');
        panel.classList.add(UI_CLASSES.panel);

        const header = document.createElement('div');
        header.classList.add(UI_CLASSES.panelHeader);

        const title = document.createElement('div');
        title.textContent = 'Subcap Tools';
        title.classList.add(UI_CLASSES.title);

        const closeButton = document.createElement('button');
        closeButton.id = UI_IDS.close;
        closeButton.type = 'button';
        closeButton.textContent = 'Close';
        closeButton.classList.add(UI_CLASSES.closeButton);
        closeButton.addEventListener('click', () => {
          overlay.classList.add(UI_CLASSES.hidden);
        });

        header.appendChild(title);
        header.appendChild(closeButton);

        const tabs = document.createElement('div');
        tabs.classList.add(UI_CLASSES.tabs);

        const tabManage = document.createElement('button');
        tabManage.id = UI_IDS.tabManage;
        tabManage.type = 'button';
        tabManage.textContent = 'Manage Transactions';
        tabManage.classList.add(UI_CLASSES.tabButton);
        tabManage.addEventListener('click', () => switchTab('manage'));

        const tabSpend = document.createElement('button');
        tabSpend.id = UI_IDS.tabSpend;
        tabSpend.type = 'button';
        tabSpend.textContent = 'Spend Totals';
        tabSpend.classList.add(UI_CLASSES.tabButton);
        tabSpend.addEventListener('click', () => switchTab('spend'));

        const tabSync = document.createElement('button');
        tabSync.id = UI_IDS.tabSync;
        tabSync.type = 'button';
        tabSync.textContent = 'Sync';
        tabSync.classList.add(UI_CLASSES.tabButton);
        tabSync.addEventListener('click', () => switchTab('sync'));

        tabs.appendChild(tabSpend);
        tabs.appendChild(tabManage);
        tabs.appendChild(tabSync);

        const privacyNotice = document.createElement('div');
        privacyNotice.textContent =
          'Privacy: data stays in your browser (Tampermonkey storage/localStorage). ' +
          'No remote logging. Synced payload contains only settings and monthly totals.';
        privacyNotice.classList.add(UI_CLASSES.small);

        manageContent = document.createElement('div');
        manageContent.id = UI_IDS.manageContent;
        manageContent.classList.add(UI_CLASSES.stackLoose, UI_CLASSES.hidden);

        spendContent = document.createElement('div');
        spendContent.id = UI_IDS.spendContent;
        spendContent.classList.add(UI_CLASSES.stackLoose, UI_CLASSES.hidden);

        syncContent = createSyncTab(syncManager, cardName, cardSettings, storedTransactions, THEME, onSyncStateChanged);
        syncContent.id = UI_IDS.syncContent;
        syncContent.classList.add(UI_CLASSES.hidden);

        panel.appendChild(header);
        panel.appendChild(tabs);
        panel.appendChild(privacyNotice);
        panel.appendChild(manageContent);
        panel.appendChild(spendContent);
        panel.appendChild(syncContent);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);
      } else {
        manageContent = document.getElementById(UI_IDS.manageContent);
        spendContent = document.getElementById(UI_IDS.spendContent);
        syncContent = document.getElementById(UI_IDS.syncContent);
      }

      if (manageContent) {
        if (currentCardSupportsManage) {
          renderManageView(
            manageContent,
            data,
            storedTransactions,
            cardSettings,
            cardConfig,
            (updateFn) => {
              const nextSettings = loadSettings();
              const nextCardSettings = ensureCardSettings(nextSettings, cardName, cardConfig);
              if (typeof updateFn === 'function') {
                updateFn(nextCardSettings);
              }
              saveSettings(nextSettings);
              onSyncStateChanged();
            }
          );
        } else {
          manageContent.innerHTML = '';
        }
      }
      if (spendContent) {
        renderSpendingView(spendContent, storedTransactions, cardSettings, cardName, capPolicy);
      }
      if (syncContent) {
        const nextSyncContent = createSyncTab(
          syncManager,
          cardName,
          cardSettings,
          storedTransactions,
          THEME,
          onSyncStateChanged
        );
        nextSyncContent.id = UI_IDS.syncContent;
        syncContent.replaceWith(nextSyncContent);
      }

      if (shouldShow || wasVisible) {
        overlay.classList.remove(UI_CLASSES.hidden);
      }
      switchTab(activeTabId);
    }

    async function main() {
      const profile = PORTAL_PROFILES.find((entry) => matchesProfile(entry));
      if (!profile) {
        removeUI();
        return;
      }

      const waitTimeoutMs = Number.isFinite(profile.waitTimeoutMs) ? profile.waitTimeoutMs : 15000;
      const allowOverlayWithoutRows = profile.allowOverlayWithoutRows === true;

      const cardNameMatch = await waitForAnyXPath(
        profile.cardNameXPaths || [profile.cardNameXPath],
        waitTimeoutMs
      );
      const cardNameNode = cardNameMatch?.node || null;
      if (!cardNameNode) {
        removeUI();
        return;
      }

      const rawCardName = normalizeText(cardNameNode.textContent);
      const matchedCardName = resolveSupportedCardName(rawCardName);
      if (!matchedCardName) {
        removeUI();
        return;
      }

      const cardName = matchedCardName;
      const cardConfig = CARD_CONFIGS[cardName];
      if (!cardConfig) {
        removeUI();
        return;
      }

      const tableBodyXPaths = profile.tableBodyXPaths || [profile.tableBodyXPath];
      const initialTableBodyMatch = allowOverlayWithoutRows
        ? findAnyTableBody(tableBodyXPaths)
        : await waitForAnyTableBodyRows(tableBodyXPaths, waitTimeoutMs);
      const tableBody = initialTableBodyMatch?.tbody || null;
      const preferredTableBodyXPath = initialTableBodyMatch?.xpath || null;
      if (!tableBody && !allowOverlayWithoutRows) {
        removeUI();
        return;
      }

      const initialSettings = loadSettings();
      const initialCardSettings = ensureCardSettings(initialSettings, cardName, cardConfig);
      if (tableBody) {
        const initialData = buildData(tableBody, cardName, initialCardSettings);
        updateStoredTransactions(initialSettings, cardName, cardConfig, initialData.transactions);
      }
      saveSettings(initialSettings);

      let refreshInProgress = false;
      let refreshPending = false;
      const observedTableBodyXPaths = preferredTableBodyXPath
        ? [preferredTableBodyXPath, ...tableBodyXPaths.filter((xpath) => xpath !== preferredTableBodyXPath)]
        : tableBodyXPaths;

      const refreshOverlay = async (shouldShow = false) => {
        if (refreshInProgress) {
          refreshPending = true;
          return;
        }
        refreshInProgress = true;
        const latestTableBodyMatch = await waitForAnyTableBodyRows(
          observedTableBodyXPaths,
          allowOverlayWithoutRows ? 1500 : waitTimeoutMs,
          allowOverlayWithoutRows ? 0 : 2000
        );
        const latestTableBody = latestTableBodyMatch?.tbody || null;
        try {
          if (!latestTableBody && !allowOverlayWithoutRows) {
            return;
          }
          await ensureCapPolicyLoaded();
          const settings = loadSettings();
          const cardSettings = ensureCardSettings(settings, cardName, cardConfig);
          let data;
          if (latestTableBody) {
            data = buildData(latestTableBody, cardName, cardSettings);
            updateStoredTransactions(settings, cardName, cardConfig, data.transactions);
          } else {
            data = buildFallbackData(cardName, cardSettings);
          }
          saveSettings(settings);
          if (syncManager.isEnabled() && !syncManager.isUnlocked() && syncManager.hasRememberedUnlockCache()) {
            await syncManager.tryUnlockFromRememberedCache();
          }
          const storedTransactions = getStoredTransactions(cardName, cardSettings);
          createOverlay(
            data,
            settings,
            storedTransactions,
            cardName,
            cardConfig,
            cardSettings,
            () => {
              refreshOverlay();
            },
            shouldShow,
            activeCapPolicy
          );
        } finally {
          refreshInProgress = false;
          if (refreshPending) {
            refreshPending = false;
            refreshOverlay();
          }
        }
      };

      createButton(() => refreshOverlay(true));
      if (stopTableObserver) {
        stopTableObserver();
      }
      stopTableObserver = observeTableBody(observedTableBodyXPaths, refreshOverlay);
      ensureCapPolicyLoaded().catch(() => {});
    }

    const runMainSafe = () => {
      main().catch((error) => {
        console.error('[Subcap] Failed to initialize on current page:', error);
      });
    };

    runMainSafe();

    let lastObservedUrl = window.location.href;
    window.setInterval(() => {
      const currentUrl = window.location.href;
      if (currentUrl === lastObservedUrl) {
        return;
      }
      lastObservedUrl = currentUrl;
      runMainSafe();
    }, 1000);
  })();

})();
