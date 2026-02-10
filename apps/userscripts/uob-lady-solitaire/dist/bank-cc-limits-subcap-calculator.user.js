// ==UserScript==
// @name         Bank CC Limits Subcap Calculator
// @namespace    local
// @version      0.6.0
// @description  Extract credit card transactions and manage subcap categories with optional sync
// @match        https://pib.uob.com.sg/PIBCust/2FA/processSubmit.do*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      bank-cc-sync.your-domain.workers.dev
// @connect      localhost
// ==/UserScript==
// GENERATED FILE - DO NOT EDIT.
// Source: apps/userscripts/uob-lady-solitaire/src/index.user.js

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

    async request(endpoint, options = {}) {
      const url = `${this.baseUrl}${endpoint}`;
      const headers = {
        'Content-Type': 'application/json',
        ...options.headers
      };

      if (this.token) {
        headers.Authorization = `Bearer ${this.token}`;
      }

      const config = {
        ...options,
        headers
      };

      try {
        const response = await fetch(url, config);

        if (!response.ok) {
          const error = await response.json().catch(() => ({ message: response.statusText }));
          throw new Error(error.message || `HTTP ${response.status}`);
        }

        return await response.json();
      } catch (error) {
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

  function validateSyncPayload(payload) {
    if (!payload || typeof payload !== 'object') return false;
    if (typeof payload.version !== 'number' || payload.version < 0) return false;
    if (typeof payload.deviceId !== 'string' || !payload.deviceId) return false;
    if (typeof payload.timestamp !== 'number' || payload.timestamp <= 0) return false;
    if (!payload.data || typeof payload.data !== 'object') return false;
    if (!payload.data.cards || typeof payload.data.cards !== 'object') return false;
    return true;
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

        if (!validateSyncPayload(decrypted)) {
          throw new Error('Invalid sync payload structure');
        }

        return {
          success: true,
          data: decrypted.data,
          version: response.version,
          timestamp: decrypted.timestamp
        };
      } catch (error) {
        console.error('[SyncEngine] Pull failed:', error);
        return { success: false, error: error.message };
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
        return { success: false, error: error.message };
      }
    }

    mergeCardSettings(local, remote) {
      if (!remote) return local;
      if (!local) return remote;

      const merged = { ...local };

      merged.merchantMap = { ...local.merchantMap };
      for (const [merchant, category] of Object.entries(remote.merchantMap || {})) {
        merged.merchantMap[merchant] = category;
      }

      merged.monthlyTotals = { ...local.monthlyTotals, ...remote.monthlyTotals };

      if (remote.selectedCategories) {
        merged.selectedCategories = remote.selectedCategories;
      }
      if (remote.defaultCategory) {
        merged.defaultCategory = remote.defaultCategory;
      }

      return merged;
    }

    async sync(localData, currentVersion, deviceId) {
      const pullResult = await this.pull();

      if (!pullResult.success) {
        return pullResult;
      }

      let dataToSync = localData;

      if (pullResult.data) {
        const mergedCards = {};
        const allCardNames = new Set([
          ...Object.keys(localData.cards || {}),
          ...Object.keys(pullResult.data.cards || {})
        ]);

        for (const cardName of allCardNames) {
          mergedCards[cardName] = this.mergeCardSettings(
            localData.cards[cardName],
            pullResult.data.cards[cardName]
          );
        }

        dataToSync = { cards: mergedCards };
      }

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
      this.key = null;
    }

    async init() {
      this.key = await deriveKey(this.passphrase, this.salt);
    }

    async encrypt(data) {
      if (!this.key) await this.init();
      const encrypted = await encrypt(this.key, data);
      return {
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        salt: arrayBufferToBase64(this.salt)
      };
    }

    async decrypt(ciphertext, iv, saltBase64) {
      if (saltBase64) {
        this.salt = base64ToArrayBuffer(saltBase64);
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

  // Build-time configuration for sync server
  const SYNC_CONFIG = {
    // Change this URL if self-hosting
    serverUrl: 'https://bank-cc-sync.your-domain.workers.dev',
    
    // For self-hosters: Update to your own server URL before building
    // Example: 'https://sync.example.com' or 'http://localhost:3000'
  };

  class SyncManager {
    constructor(storage) {
      this.storage = storage;
      this.syncClient = null;
      this.enabled = false;
      this.config = this.loadSyncConfig();
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

    isEnabled() {
      return this.config.enabled === true;
    }

    async setupSync(email, passphrase, deviceName, serverUrl) {
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
          deviceName,
          email,
          token: authResult.token,
          tier: authResult.tier,
          shareMappings: authResult.tier === 'free', // Free users share by default
          lastSync: 0,
          serverUrl: actualServerUrl // Store custom server URL
        });

        this.syncClient.api.setToken(authResult.token);
        this.enabled = true;

        return { success: true };
      } catch (error) {
        console.error('[SyncManager] Setup failed:', error);
        return { success: false, error: error.message };
      }
    }

    async sync(localData) {
      if (!this.isEnabled() || !this.syncClient) {
        return { success: false, error: 'Sync not enabled' };
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
    status: 'cc-subcap-status'
  };

  function ensureUiStyles(theme) {
    if (document.getElementById('cc-subcap-styles')) {
      return;
    }
    const style = document.createElement('style');
    style.id = 'cc-subcap-styles';
    style.textContent = `
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
    }
    .${UI_CLASSES.buttonRow} {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .${UI_CLASSES.status} {
      padding: 12px;
      border-radius: 8px;
    }
    `;
    document.head.appendChild(style);
  }

  function createSyncTab(syncManager, settings, THEME) {
    ensureUiStyles(THEME);
    const container = document.createElement('div');
    container.id = 'cc-subcap-sync';
    container.style.display = 'none';
    container.classList.add(UI_CLASSES.tab, UI_CLASSES.stackLoose);

    const isEnabled = syncManager.isEnabled();
    const config = syncManager.config;

    if (!isEnabled) {
      container.innerHTML = `
      <div class="${UI_CLASSES.stack}">
        <h3 style="margin: 0; color: ${THEME.text}">Sync Settings</h3>
        <p style="color: ${THEME.muted}; margin: 0;">
          Enable sync to access your settings across devices.
        </p>
        <div class="${UI_CLASSES.section} ${UI_CLASSES.sectionAccent}">
          <strong style="color: ${THEME.accentText}">Privacy First:</strong>
          <ul style="margin: 8px 0 0 0; padding-left: 20px; color: ${THEME.accentText};">
            <li>Settings are encrypted before leaving your browser</li>
            <li>Merchant mappings are NOT encrypted (supports community-based data grooming)</li>
            <li>Raw transactions stay local</li>
          </ul>
        </div>
        <button id="setup-sync-btn" style="
          padding: 12px 24px;
          background: ${THEME.accent};
          color: white;
          border: none;
          border-radius: 8px;
          font-weight: 500;
          cursor: pointer;
        ">Setup Sync</button>
      </div>
    `;

      const setupBtn = container.querySelector('#setup-sync-btn');
      setupBtn.addEventListener('click', () => {
        showSyncSetupDialog(syncManager, THEME);
      });
    } else {
      const lastSync = config.lastSync ? new Date(config.lastSync).toLocaleString() : 'Never';
      const shareMappingsText = config.shareMappings ? 'Yes (helping community)' : 'No (private)';

      container.innerHTML = `
      <div class="${UI_CLASSES.stack}">
        <h3 style="margin: 0; color: ${THEME.text}">Sync Settings</h3>
        <div class="${UI_CLASSES.section} ${UI_CLASSES.sectionPanel}">
          <p style="margin: 0 0 8px 0;"><strong>Status:</strong> ☁️ Enabled</p>
          <p style="margin: 0 0 8px 0;"><strong>Device:</strong> ${config.deviceName}</p>
          <p style="margin: 0 0 8px 0;"><strong>Last Sync:</strong> ${lastSync}</p>
          <p style="margin: 0 0 8px 0;"><strong>Tier:</strong> ${config.tier}</p>
          <p style="margin: 0;"><strong>Share Mappings:</strong> ${shareMappingsText}</p>
        </div>
        <div class="${UI_CLASSES.stackTight}">
          <div class="${UI_CLASSES.buttonRow}">
            <button id="sync-now-btn" style="
              padding: 12px 24px;
              background: ${THEME.accent};
              color: white;
              border: none;
              border-radius: 8px;
              font-weight: 500;
              cursor: pointer;
            ">Sync Now</button>
            <button id="disable-sync-btn" style="
              padding: 12px 24px;
              background: ${THEME.warning};
              color: white;
              border: none;
              border-radius: 8px;
              font-weight: 500;
              cursor: pointer;
            ">Disable Sync</button>
          </div>
          <div id="sync-status" class="${UI_CLASSES.status}" style="display: none;"></div>
        </div>
      </div>
    `;

      container.querySelector('#sync-now-btn').addEventListener('click', async () => {
        const statusDiv = container.querySelector('#sync-status');
        statusDiv.style.display = 'block';
        statusDiv.style.background = THEME.accentSoft;
        statusDiv.style.color = THEME.accentText;
        statusDiv.textContent = 'Syncing...';

        const result = await syncManager.sync({ cards: settings.cards });

        if (result.success) {
          statusDiv.style.background = '#d1fae5';
          statusDiv.style.color = '#065f46';
          statusDiv.textContent = '✓ Synced successfully!';
          setTimeout(() => { statusDiv.style.display = 'none'; }, 3000);
        } else {
          statusDiv.style.background = THEME.warningSoft;
          statusDiv.style.color = THEME.warning;
          statusDiv.textContent = `❌ Sync failed: ${result.error}`;
        }
      });

      container.querySelector('#disable-sync-btn').addEventListener('click', () => {
        if (confirm('Are you sure you want to disable sync? Your local data will remain intact.')) {
          syncManager.disableSync();
          location.reload();
        }
      });
    }

    return container;
  }

  function showSyncSetupDialog(syncManager, THEME) {
    ensureUiStyles(THEME);
    const overlay = document.createElement('div');
    overlay.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: ${THEME.overlay}; z-index: 100001;
    display: flex; align-items: center; justify-content: center;
  `;

    overlay.innerHTML = `
    <div class="${UI_CLASSES.modal} ${UI_CLASSES.stack}" style="
      max-width: 500px; width: 90%; box-shadow: ${THEME.shadow};
    ">
      <h3 style="margin: 0;">Setup Sync</h3>
      <div class="${UI_CLASSES.stackTight}">
        <label style="display: block; font-weight: 500;">Server URL</label>
        <input id="sync-server-url" type="url" placeholder="https://your-server.com" value="${SYNC_CONFIG.serverUrl}" style="
          width: 100%; padding: 12px; border: 1px solid ${THEME.border};
          border-radius: 8px; box-sizing: border-box;
        "/>
      </div>
      <div class="${UI_CLASSES.stackTight}">
        <label style="display: block; font-weight: 500;">Email</label>
        <input id="sync-email" type="email" placeholder="your@email.com" style="
          width: 100%; padding: 12px; border: 1px solid ${THEME.border};
          border-radius: 8px; box-sizing: border-box;
        "/>
      </div>
      <div class="${UI_CLASSES.stackTight}">
        <label style="display: block; font-weight: 500;">Passphrase</label>
        <input id="sync-passphrase" type="password" placeholder="Enter secure passphrase" style="
          width: 100%; padding: 12px; border: 1px solid ${THEME.border};
          border-radius: 8px; box-sizing: border-box;
        "/>
      </div>
      <div class="${UI_CLASSES.stackTight}">
        <label style="display: block; font-weight: 500;">Device Name</label>
        <input id="sync-device" type="text" placeholder="My Laptop" style="
          width: 100%; padding: 12px; border: 1px solid ${THEME.border};
          border-radius: 8px; box-sizing: border-box;
        "/>
      </div>
      <div class="${UI_CLASSES.buttonRow}">
        <button id="sync-setup-save" style="
          flex: 1; padding: 12px; background: ${THEME.accent}; color: white;
          border: none; border-radius: 8px; font-weight: 500; cursor: pointer;
        ">Setup</button>
        <button id="sync-setup-cancel" style="
          flex: 1; padding: 12px; background: ${THEME.panel}; color: ${THEME.text};
          border: none; border-radius: 8px; font-weight: 500; cursor: pointer;
        ">Cancel</button>
      </div>
      <div id="sync-setup-status" class="${UI_CLASSES.status}" style="display: none;"></div>
    </div>
  `;

    document.body.appendChild(overlay);

    overlay.querySelector('#sync-setup-cancel').addEventListener('click', () => {
      overlay.remove();
    });

    overlay.querySelector('#sync-setup-save').addEventListener('click', async () => {
      const serverUrl = overlay.querySelector('#sync-server-url').value.trim();
      const email = overlay.querySelector('#sync-email').value;
      const passphrase = overlay.querySelector('#sync-passphrase').value;
      const deviceName = overlay.querySelector('#sync-device').value;
      const statusDiv = overlay.querySelector('#sync-setup-status');

      if (!serverUrl || !email || !passphrase || !deviceName) {
        statusDiv.style.display = 'block';
        statusDiv.style.background = THEME.warningSoft;
        statusDiv.style.color = THEME.warning;
        statusDiv.textContent = 'All fields are required';
        return;
      }

      // Validate server URL
      try {
        validateServerUrl(serverUrl);
      } catch (error) {
        statusDiv.style.display = 'block';
        statusDiv.style.background = THEME.warningSoft;
        statusDiv.style.color = THEME.warning;
        statusDiv.textContent = error.message;
        return;
      }

      statusDiv.style.display = 'block';
      statusDiv.style.background = THEME.accentSoft;
      statusDiv.style.color = THEME.accentText;
      statusDiv.textContent = 'Setting up sync...';

      const result = await syncManager.setupSync(email, passphrase, deviceName, serverUrl);

      if (result.success) {
        statusDiv.style.background = '#d1fae5';
        statusDiv.style.color = '#065f46';
        statusDiv.textContent = '✓ Sync setup complete! Reloading...';
        setTimeout(() => location.reload(), 1500);
      } else {
        statusDiv.style.background = THEME.warningSoft;
        statusDiv.style.color = THEME.warning;
        statusDiv.textContent = `❌ Setup failed: ${result.error}`;
      }
    });
  }

  // Phase 3: Sync integration (imports added)

  (() => {

    if (window.__ccSubcapInjected) {
      return;
    }
    window.__ccSubcapInjected = true;

    const URL_PREFIX = 'https://pib.uob.com.sg/PIBCust/2FA/processSubmit.do';
    const STORAGE_KEY = 'ccSubcapSettings';
    const TARGET_CARD_NAME = "LADY'S SOLITAIRE CARD";

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
        subcapSlots: 2
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


    const TRANSACTION_LOADING_NOTICE = '💡 <strong>Totals looking wrong, or missing transactions?</strong><br>Load all transactions on the UOB site by clicking "View More" first, then reopen the panel through the button.';

    // Helper constants for warnings
    const CATEGORY_THRESHOLDS = { critical: 750, warning: 700 };

    // Helper functions
    function applyStyles(element, styles) {
      Object.entries(styles).forEach(([key, value]) => {
        element.style[key] = value;
      });
    }


    function getWarningSeverity(value) {
      if (value >= CATEGORY_THRESHOLDS.critical) return 'critical';
      if (value >= CATEGORY_THRESHOLDS.warning) return 'warning';
      return 'normal';
    }

    function createStyledPill(text, severity = 'normal') {
      const severityStyles = {
        critical: { background: '#fee2e2', border: '1px solid #dc2626', color: '#991b1b', fontWeight: '700' },
        warning: { background: THEME.warningSoft, border: `1px solid ${THEME.warning}`, color: THEME.warning, fontWeight: '600' },
        normal: { background: THEME.surface, border: `1px solid ${THEME.border}`, color: THEME.muted, fontWeight: '500' }
      };
      
      const pill = document.createElement('div');
      const baseStyles = {
        padding: '4px 8px',
        borderRadius: '999px',
        fontSize: '12px',
        display: 'inline-block'
      };
      
      applyStyles(pill, { ...baseStyles, ...severityStyles[severity] });
      pill.textContent = text;
      return pill;
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

    function observeTableBody(tableBodyXPath, onChange) {
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
        const tbody = await waitForXPath(tableBodyXPath);
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

    function resolveCategory(merchantName, cardSettings) {
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
      
      return cardSettings.defaultCategory || 'Others';
    }

    function buildTransactions(tbody, cardSettings) {
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
          const category = resolveCategory(merchantName, cardSettings);

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
      const { transactions, diagnostics } = buildTransactions(tableBody, cardSettings);
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

    function getStoredTransactions(cardSettings) {
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
        const category = resolveCategory(merchantDetail, cardSettings);

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
      button.style.position = 'fixed';
      button.style.bottom = '24px';
      button.style.right = '24px';
      button.style.zIndex = '99999';
      button.style.padding = '12px 16px';
      button.style.borderRadius = '999px';
      button.style.border = `1px solid ${THEME.accent}`;
      button.style.background = THEME.accent;
      button.style.color = '#ffffff';
      button.style.fontSize = '14px';
      button.style.fontWeight = '600';
      button.style.cursor = 'pointer';
      button.style.boxShadow = THEME.accentShadow;
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
      title.textContent = 'Select bonus categories (2)';
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

    function renderSpendingView(container, storedTransactions, cardSettings) {
      container.innerHTML = '';
      container.classList.add(UI_CLASSES.tab, UI_CLASSES.stackLoose);

      const title = document.createElement('div');
      title.textContent = 'Spend Totals (Last 3 Calendar Months)';
      title.style.fontWeight = '600';

      const subtitle = document.createElement('div');
      subtitle.textContent = 'Grouped by posting month using stored transactions.';
      subtitle.style.opacity = '0.7';
      subtitle.style.fontSize = '12px';

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
        empty.textContent = 'No stored transactions yet.';
        empty.style.opacity = '0.8';
        container.appendChild(empty);
        return;
      }

      months.forEach((monthKey) => {
        const monthData = monthlyTotals[monthKey];
        const monthTransactions = transactionsByMonth[monthKey] || [];
        const grouped = {};

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

        const header = document.createElement('button');
        header.type = 'button';
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.justifyContent = 'space-between';
        header.style.width = '100%';
        header.style.border = `1px solid ${THEME.border}`;
        header.style.borderRadius = '10px';
        header.style.background = THEME.panel;
        header.style.padding = '10px 12px';
        header.style.cursor = 'pointer';
        header.style.color = THEME.text;

        const headerLeft = document.createElement('div');
        headerLeft.style.display = 'flex';
        headerLeft.style.alignItems = 'center';
        headerLeft.style.gap = '8px';

        const chevron = document.createElement('span');
        chevron.textContent = '▸';
        chevron.style.fontSize = '12px';
        chevron.style.color = THEME.muted;

        const monthLabel = document.createElement('div');
        monthLabel.textContent = formatMonthLabel(monthKey);
        monthLabel.style.fontWeight = '600';

        headerLeft.appendChild(chevron);
        headerLeft.appendChild(monthLabel);

        const headerRight = document.createElement('div');
        headerRight.style.display = 'flex';
        headerRight.style.flexWrap = 'wrap';
        headerRight.style.gap = '6px';
        headerRight.style.justifyContent = 'flex-end';

        const totalPill = document.createElement('div');
        totalPill.textContent = `Total ${monthData.total_amount.toFixed(2)}`;
        totalPill.style.padding = '4px 8px';
        totalPill.style.borderRadius = '999px';
        totalPill.style.background = THEME.accentSoft;
        totalPill.style.border = `1px solid ${THEME.border}`;
        totalPill.style.fontWeight = '600';
        totalPill.style.fontSize = '12px';
        totalPill.style.color = THEME.accentText;

        headerRight.appendChild(totalPill);

        const warnings = [];
        
        categoryOrder.forEach((category) => {
          const value = monthData.totals?.[category] || 0;
          const severity = getWarningSeverity(value);
          const pill = createStyledPill(`${category} ${value.toFixed(2)}`, severity);
          
          if (severity === 'critical') {
            warnings.push({ category, value, level: 'critical' });
          } else if (severity === 'warning') {
            warnings.push({ category, value, level: 'warning' });
          }
          
          headerRight.appendChild(pill);
        });

        header.appendChild(headerLeft);
        header.appendChild(headerRight);

        const details = document.createElement('div');
        details.style.display = 'none';
        details.classList.add(UI_CLASSES.section, UI_CLASSES.sectionAccent);

        categoryOrder.forEach((category) => {
          const group = grouped[category];
          if (!group) {
            return;
          }
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
          const categoryHeader = document.createElement('div');
          categoryHeader.style.display = 'flex';
          categoryHeader.style.justifyContent = 'space-between';
          categoryHeader.style.fontWeight = '600';
          categoryHeader.style.marginTop = '8px';

          const categoryLabel = document.createElement('div');
          categoryLabel.textContent = category;

          const categoryTotal = document.createElement('div');
          categoryTotal.textContent = group.total.toFixed(2);

          categoryHeader.appendChild(categoryLabel);
          categoryHeader.appendChild(categoryTotal);

          const list = document.createElement('div');
          list.style.display = 'grid';
          list.style.gridTemplateColumns = '1.6fr 0.6fr 0.6fr';
          list.style.gap = '6px 12px';
          list.style.marginTop = '6px';

          const headerMerchant = document.createElement('div');
          headerMerchant.textContent = 'Merchant';
          headerMerchant.style.fontWeight = '600';
          headerMerchant.style.color = THEME.muted;

          const headerDate = document.createElement('div');
          headerDate.textContent = 'Posting Date';
          headerDate.style.fontWeight = '600';
          headerDate.style.color = THEME.muted;

          const headerAmount = document.createElement('div');
          headerAmount.textContent = 'Amount';
          headerAmount.style.fontWeight = '600';
          headerAmount.style.color = THEME.muted;

          list.appendChild(headerMerchant);
          list.appendChild(headerDate);
          list.appendChild(headerAmount);

          sortedTransactions.forEach((tx) => {
            const merchantCell = document.createElement('div');
            merchantCell.textContent = tx.merchant_detail || '-';
            merchantCell.style.wordBreak = 'break-word';

            const dateCell = document.createElement('div');
            dateCell.textContent = tx.posting_date || '-';
            dateCell.style.color = THEME.muted;

            const amountCell = document.createElement('div');
            amountCell.textContent =
              typeof tx.amount_value === 'number' ? tx.amount_value.toFixed(2) : '-';

            list.appendChild(merchantCell);
            list.appendChild(dateCell);
            list.appendChild(amountCell);
          });

          details.appendChild(categoryHeader);
          details.appendChild(list);
        });

        header.addEventListener('click', () => {
          const isOpen = details.style.display === 'block';
          details.style.display = isOpen ? 'none' : 'block';
          chevron.textContent = isOpen ? '▸' : '▾';
        });

        card.appendChild(header);
        
        // Add warning banner if there are any warnings
        if (warnings.length > 0) {
          const warningBanner = document.createElement('div');
          warningBanner.style.padding = '10px 12px';
          warningBanner.style.borderRadius = '8px';
          warningBanner.style.fontSize = '13px';
          
          const criticalWarnings = warnings.filter((w) => w.level === 'critical');
          const softWarnings = warnings.filter((w) => w.level === 'warning');
          
          if (criticalWarnings.length > 0) {
            warningBanner.style.background = '#fee2e2';
            warningBanner.style.border = '2px solid #dc2626';
            warningBanner.style.color = '#991b1b';
            warningBanner.style.fontWeight = '700';
            
            const title = document.createElement('div');
            title.textContent = '⚠️ Cap Exceeded Alert';
            title.style.marginBottom = '4px';
            title.style.fontSize = '14px';
            
            const message = document.createElement('div');
            const cats = criticalWarnings.map((w) => `${w.category} ($${w.value.toFixed(2)})`).join(', ');
            message.textContent = `The following categories have exceeded the $${CATEGORY_THRESHOLDS.critical} cap: ${cats}`;
            message.style.fontWeight = '400';
            
            warningBanner.appendChild(title);
            warningBanner.appendChild(message);
          } else if (softWarnings.length > 0) {
            warningBanner.style.background = THEME.warningSoft;
            warningBanner.style.border = `2px solid ${THEME.warning}`;
            warningBanner.style.color = THEME.warning;
            warningBanner.style.fontWeight = '600';
            
            const title = document.createElement('div');
            title.textContent = '⚡ Approaching Cap';
            title.style.marginBottom = '4px';
            title.style.fontSize = '14px';
            
            const message = document.createElement('div');
            const cats = softWarnings.map((w) => `${w.category} ($${w.value.toFixed(2)})`).join(', ');
            message.textContent = `Nearing $${CATEGORY_THRESHOLDS.critical} cap: ${cats}`;
            message.style.fontWeight = '400';
            
            warningBanner.appendChild(title);
            warningBanner.appendChild(message);
          }
          
          card.appendChild(warningBanner);
        }
        
        card.appendChild(details);
        container.appendChild(card);
      });
    }

    let activeTabId = 'spend';

    function switchTab(tab) {
      const manageContent = document.getElementById(UI_IDS.manageContent);
      const spendContent = document.getElementById(UI_IDS.spendContent);
      const syncContent = document.getElementById(UI_IDS.syncContent);
      const tabManage = document.getElementById(UI_IDS.tabManage);
      const tabSpend = document.getElementById(UI_IDS.tabSpend);
      const tabSync = document.getElementById(UI_IDS.tabSync);

      if (!manageContent || !spendContent || !syncContent || !tabManage || !tabSpend || !tabSync) {
        return;
      }

      activeTabId = tab;
      const isManage = tab === 'manage';
      const isSpend = tab === 'spend';
      const isSync = tab === 'sync';
      manageContent.style.display = isManage ? 'flex' : 'none';
      spendContent.style.display = isSpend ? 'flex' : 'none';
      syncContent.style.display = isSync ? 'flex' : 'none';

      const setTabState = (tabElement, isActive) => {
        tabElement.style.background = isActive ? THEME.accentSoft : 'transparent';
        tabElement.style.borderColor = isActive ? THEME.accent : THEME.border;
        tabElement.style.color = isActive ? THEME.accentText : THEME.text;
        tabElement.style.fontWeight = isActive ? '600' : '500';
      };

      setTabState(tabManage, isManage);
      setTabState(tabSpend, isSpend);
      setTabState(tabSync, isSync);
    }

    function createOverlay(data, storedTransactions, cardSettings, cardConfig, onChange, shouldShow = false) {
      ensureUiStyles(THEME);
      let overlay = document.getElementById(UI_IDS.overlay);
      let manageContent;
      let spendContent;
      const wasVisible = overlay && overlay.style.display === 'flex';

      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = UI_IDS.overlay;
        overlay.style.position = 'fixed';
        overlay.style.inset = '0';
        overlay.style.zIndex = '99998';
        overlay.style.background = THEME.overlay;
        overlay.style.display = 'none';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.addEventListener('click', (event) => {
          if (event.target === overlay) {
            overlay.style.display = 'none';
          }
        });

        const panel = document.createElement('div');
        panel.style.width = 'min(960px, 92vw)';
        panel.style.maxHeight = '85vh';
        panel.style.background = THEME.panel;
        panel.style.color = THEME.text;
        panel.style.border = `1px solid ${THEME.border}`;
        panel.style.borderRadius = '12px';
        panel.style.padding = '16px';
        panel.style.boxShadow = THEME.shadow;
        panel.classList.add(UI_CLASSES.stackLoose);

        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';

        const title = document.createElement('div');
        title.textContent = 'Subcap Tools';
        title.style.fontWeight = '600';
        title.style.fontSize = '16px';
        title.style.color = THEME.accent;

        const closeButton = document.createElement('button');
        closeButton.id = UI_IDS.close;
        closeButton.type = 'button';
        closeButton.textContent = 'Close';
        closeButton.style.background = THEME.surface;
        closeButton.style.color = THEME.text;
        closeButton.style.border = `1px solid ${THEME.border}`;
        closeButton.style.borderRadius = '8px';
        closeButton.style.padding = '6px 10px';
        closeButton.style.cursor = 'pointer';
        closeButton.addEventListener('click', () => {
          overlay.style.display = 'none';
        });

        header.appendChild(title);
        header.appendChild(closeButton);

        const tabs = document.createElement('div');
        tabs.style.display = 'flex';
        tabs.style.gap = '8px';

        const tabManage = document.createElement('button');
        tabManage.id = UI_IDS.tabManage;
        tabManage.type = 'button';
        tabManage.textContent = 'Manage Transactions';
        tabManage.style.border = `1px solid ${THEME.border}`;
        tabManage.style.borderRadius = '999px';
        tabManage.style.padding = '6px 12px';
        tabManage.style.background = 'transparent';
        tabManage.style.color = THEME.text;
        tabManage.style.cursor = 'pointer';
        tabManage.addEventListener('click', () => switchTab('manage'));

        const tabSpend = document.createElement('button');
        tabSpend.id = UI_IDS.tabSpend;
        tabSpend.type = 'button';
        tabSpend.textContent = 'Spend Totals';
        tabSpend.style.border = `1px solid ${THEME.border}`;
        tabSpend.style.borderRadius = '999px';
        tabSpend.style.padding = '6px 12px';
        tabSpend.style.background = 'transparent';
        tabSpend.style.color = THEME.text;
        tabSpend.style.cursor = 'pointer';
        tabSpend.addEventListener('click', () => switchTab('spend'));

        const tabSync = document.createElement('button');
        tabSync.id = UI_IDS.tabSync;
        tabSync.type = 'button';
        tabSync.textContent = 'Sync';
        tabSync.style.border = `1px solid ${THEME.border}`;
        tabSync.style.borderRadius = '999px';
        tabSync.style.padding = '6px 12px';
        tabSync.style.background = 'transparent';
        tabSync.style.color = THEME.text;
        tabSync.style.cursor = 'pointer';
        tabSync.addEventListener('click', () => switchTab('sync'));

        tabs.appendChild(tabSpend);
        tabs.appendChild(tabManage);
        tabs.appendChild(tabSync);

        const privacyNotice = document.createElement('div');
        privacyNotice.textContent =
          'Privacy: data stays in your browser (Tampermonkey storage/localStorage). ' +
          'No remote logging. Stored transactions cover the last 3 calendar months.';
        privacyNotice.style.fontSize = '12px';
        privacyNotice.style.color = THEME.muted;

        manageContent = document.createElement('div');
        manageContent.id = UI_IDS.manageContent;
        manageContent.style.display = 'none';
        manageContent.style.overflow = 'auto';

        spendContent = document.createElement('div');
        spendContent.id = UI_IDS.spendContent;
        spendContent.style.display = 'none';
        spendContent.style.overflow = 'auto';

        const syncContent = createSyncTab(syncManager, cardSettings, THEME);
        syncContent.id = UI_IDS.syncContent;
        syncContent.style.display = 'none';
        syncContent.style.overflow = 'auto';

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
      }

      if (manageContent) {
        renderManageView(
          manageContent,
          data,
          storedTransactions,
          cardSettings,
          cardConfig,
          onChange
        );
      }
      if (spendContent) {
        renderSpendingView(spendContent, storedTransactions, cardSettings);
      }

      if (shouldShow || wasVisible) {
        overlay.style.display = 'flex';
      }
      switchTab(activeTabId);
    }

    async function main() {
      if (!window.location.href.startsWith(URL_PREFIX)) {
        removeUI();
        return;
      }

      const cardNameNode = await waitForXPath(
        '/html/body/section/section/section/section/section/section/section/section/div[1]/div/form[1]/div[1]/div/div[1]/div/div[2]/h3'
      );
      if (!cardNameNode) {
        removeUI();
        return;
      }

      const cardName = normalizeText(cardNameNode.textContent);
      if (cardName !== TARGET_CARD_NAME) {
        removeUI();
        return;
      }

      const cardConfig = CARD_CONFIGS[cardName];
      if (!cardConfig) {
        removeUI();
        return;
      }

      const tableBodyXPath =
        '/html/body/section/section/section/section/section/section/section/section/div[1]/div/form[1]/div[9]/div[2]/table/tbody';
      const tableBody = await waitForTableBodyRows(tableBodyXPath);
      if (!tableBody) {
        removeUI();
        return;
      }

      const initialSettings = loadSettings();
      const initialCardSettings = ensureCardSettings(initialSettings, cardName, cardConfig);
      const initialData = buildData(tableBody, cardName, initialCardSettings);
      updateStoredTransactions(initialSettings, cardName, cardConfig, initialData.transactions);
      saveSettings(initialSettings);

      let refreshInProgress = false;
      let refreshPending = false;

      const refreshOverlay = async (shouldShow = false) => {
        if (refreshInProgress) {
          refreshPending = true;
          return;
        }
        refreshInProgress = true;
        const latestTableBody = await waitForTableBodyRows(tableBodyXPath);
        try {
          if (!latestTableBody) {
            return;
          }
          const settings = loadSettings();
          const cardSettings = ensureCardSettings(settings, cardName, cardConfig);
          const data = buildData(latestTableBody, cardName, cardSettings);
          updateStoredTransactions(settings, cardName, cardConfig, data.transactions);
          saveSettings(settings);
          const storedTransactions = getStoredTransactions(cardSettings);
          createOverlay(data, storedTransactions, cardSettings, cardConfig, (updateFn) => {
            const nextSettings = loadSettings();
            const nextCardSettings = ensureCardSettings(nextSettings, cardName, cardConfig);
            updateFn(nextCardSettings);
            saveSettings(nextSettings);
            refreshOverlay();
          }, shouldShow);
        } finally {
          refreshInProgress = false;
          if (refreshPending) {
            refreshPending = false;
            refreshOverlay();
          }
        }
      };

      createButton(() => refreshOverlay(true));
      observeTableBody(tableBodyXPath, refreshOverlay);
    }

    main();
  })();

})();
