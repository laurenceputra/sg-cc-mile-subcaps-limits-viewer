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

      // Try login first, fallback to register
      let authResult;
      try {
        authResult = await this.syncClient.login(email, this.hashPassphrase(passphrase));
      } catch (error) {
        authResult = await this.syncClient.register(email, this.hashPassphrase(passphrase));
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

  hashPassphrase(passphrase) {
    // Simple hash for demo - in production use better hashing
    let hash = 0;
    for (let i = 0; i < passphrase.length; i++) {
      const char = passphrase.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  disableSync() {
    this.saveSyncConfig({});
    this.enabled = false;
    this.syncClient = null;
  }
}
