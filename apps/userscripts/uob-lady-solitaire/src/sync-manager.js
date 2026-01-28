import { SyncClient } from '@bank-cc/sync-client';
import { generateDeviceId } from '@bank-cc/shared';
import { SYNC_CONFIG } from './config.js';

export class SyncManager {
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

  async setupSync(email, passphrase, deviceName) {
    try {
      const deviceId = generateDeviceId();
      
      this.syncClient = new SyncClient({
        serverUrl: SYNC_CONFIG.serverUrl
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
        lastSync: 0
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
      const result = await this.syncClient.contributeMappings(mappings);
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
