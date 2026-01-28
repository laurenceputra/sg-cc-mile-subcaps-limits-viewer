import { validateSyncPayload } from '@bank-cc/shared';

export class SyncEngine {
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
        deviceId: deviceId,
        timestamp: Date.now(),
        data: data
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

    // Merge merchant maps (union, newer wins on conflicts)
    merged.merchantMap = { ...local.merchantMap };
    for (const [merchant, category] of Object.entries(remote.merchantMap || {})) {
      merged.merchantMap[merchant] = category;
    }

    // Merge monthly totals
    merged.monthlyTotals = { ...local.monthlyTotals, ...remote.monthlyTotals };

    // For selectedCategories and defaultCategory, use remote if present
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
      // Merge remote changes into local
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
