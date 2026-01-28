export class Database {
  constructor(db) {
    this.db = db;
  }

  // User operations
  async createUser(email, passphraseHash, tier = 'free') {
    const stmt = this.db.prepare('INSERT INTO users (email, passphrase_hash, tier) VALUES (?, ?, ?)');
    const result = stmt.run(email, passphraseHash, tier);
    return result.lastInsertRowid;
  }

  async getUserByEmail(email) {
    const stmt = this.db.prepare('SELECT * FROM users WHERE email = ?');
    return stmt.get(email);
  }

  async getUserById(id) {
    const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(id);
  }

  async updateUserSettings(userId, shareMappings) {
    const stmt = this.db.prepare('UPDATE users SET share_mappings = ? WHERE id = ?');
    stmt.run(shareMappings ? 1 : 0, userId);
  }

  // Device operations
  async registerDevice(userId, deviceId, name) {
    const stmt = this.db.prepare('INSERT INTO devices (user_id, device_id, name) VALUES (?, ?, ?) ON CONFLICT(device_id) DO UPDATE SET last_seen = strftime(\'%s\', \'now\')');
    stmt.run(userId, deviceId, name);
  }

  async getDevicesByUser(userId) {
    const stmt = this.db.prepare('SELECT * FROM devices WHERE user_id = ? ORDER BY last_seen DESC');
    return stmt.all(userId);
  }

  async deleteDevice(deviceId, userId) {
    const stmt = this.db.prepare('DELETE FROM devices WHERE device_id = ? AND user_id = ?');
    stmt.run(deviceId, userId);
  }

  // Sync operations
  async getSyncBlob(userId) {
    const stmt = this.db.prepare('SELECT * FROM sync_blobs WHERE user_id = ?');
    return stmt.get(userId);
  }

  async upsertSyncBlob(userId, version, encryptedData) {
    const stmt = this.db.prepare(`
      INSERT INTO sync_blobs (user_id, version, encrypted_data, updated_at) 
      VALUES (?, ?, ?, strftime('%s', 'now'))
      ON CONFLICT(user_id) DO UPDATE SET 
        version = excluded.version,
        encrypted_data = excluded.encrypted_data,
        updated_at = excluded.updated_at
    `);
    stmt.run(userId, version, JSON.stringify(encryptedData));
  }

  // Shared mappings operations
  async getSharedMappings(cardType) {
    const stmt = this.db.prepare('SELECT * FROM shared_mappings WHERE card_type = ? AND status = ?');
    return stmt.all(cardType, 'approved');
  }

  async contributeMappings(userId, mappings) {
    const stmt = this.db.prepare('INSERT INTO mapping_contributions (user_id, merchant_raw, category, card_type) VALUES (?, ?, ?, ?)');
    for (const mapping of mappings) {
      stmt.run(userId, mapping.merchant, mapping.category, mapping.cardType);
    }
  }

  async getPendingContributions() {
    const stmt = this.db.prepare(`
      SELECT mc.merchant_raw, mc.category, mc.card_type, COUNT(*) as count
      FROM mapping_contributions mc
      LEFT JOIN shared_mappings sm ON mc.merchant_raw = sm.merchant_normalized AND mc.card_type = sm.card_type
      WHERE sm.id IS NULL
      GROUP BY mc.merchant_raw, mc.category, mc.card_type
      ORDER BY count DESC
    `);
    return stmt.all();
  }

  async approveMappings(merchantNormalized, category, cardType) {
    const stmt = this.db.prepare(`
      INSERT INTO shared_mappings (merchant_normalized, suggested_category, card_type, status, contribution_count)
      VALUES (?, ?, ?, 'approved', 1)
      ON CONFLICT(merchant_normalized, card_type) DO UPDATE SET
        suggested_category = excluded.suggested_category,
        status = 'approved',
        updated_at = strftime('%s', 'now')
    `);
    stmt.run(merchantNormalized, category, cardType);
  }

  // User data deletion
  async deleteUserData(userId) {
    this.db.prepare('DELETE FROM sync_blobs WHERE user_id = ?').run(userId);
    this.db.prepare('DELETE FROM devices WHERE user_id = ?').run(userId);
    this.db.prepare('DELETE FROM mapping_contributions WHERE user_id = ?').run(userId);
  }
}
