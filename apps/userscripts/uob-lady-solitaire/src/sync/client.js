import { StorageAdapter } from './storage-adapter.js';
import { ApiClient } from './api-client.js';
import { SyncEngine } from './sync-engine.js';
import { CryptoManager } from './crypto-manager.js';

export class SyncClient {
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
