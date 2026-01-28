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

  async getDeviceCount(userId) {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM devices WHERE user_id = ?');
    const result = stmt.get(userId);
    return result.count;
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

  // SECURITY: Atomic version check to prevent TOCTOU race conditions
  // This performs the version check and update in a single database operation
  async upsertSyncBlobAtomic(userId, version, encryptedData) {
    const stmt = this.db.prepare(`
      INSERT INTO sync_blobs (user_id, version, encrypted_data, updated_at) 
      VALUES (?, ?, ?, strftime('%s', 'now'))
      ON CONFLICT(user_id) DO UPDATE SET 
        version = excluded.version,
        encrypted_data = excluded.encrypted_data,
        updated_at = excluded.updated_at
      WHERE sync_blobs.version < excluded.version
    `);
    const result = stmt.run(userId, version, JSON.stringify(encryptedData));
    // Returns number of rows changed - 0 means version conflict (WHERE clause failed)
    return result.changes;
  }

  // Shared mappings operations
  async getSharedMappings(cardType) {
    const stmt = this.db.prepare('SELECT * FROM shared_mappings WHERE card_type = ? AND status = ?');
    return stmt.all(cardType, 'approved');
  }

  async contributeMappings(userId, mappings) {
    // Use transaction for atomicity
    const insertStmt = this.db.prepare('INSERT INTO mapping_contributions (user_id, merchant_raw, category, card_type) VALUES (?, ?, ?, ?)');
    
    const transaction = this.db.transaction((mappings) => {
      for (const mapping of mappings) {
        insertStmt.run(userId, mapping.merchant, mapping.category, mapping.cardType);
      }
    });
    
    try {
      transaction(mappings);
    } catch (error) {
      console.error('[DB] Transaction failed:', error);
      throw error;
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

  // User data deletion - GDPR compliant full deletion
  async deleteUserData(userId) {
    // SECURITY: Complete user data deletion for GDPR compliance
    // Must delete from ALL tables containing user data
    this.db.prepare('DELETE FROM sync_blobs WHERE user_id = ?').run(userId);
    this.db.prepare('DELETE FROM devices WHERE user_id = ?').run(userId);
    this.db.prepare('DELETE FROM mapping_contributions WHERE user_id = ?').run(userId);
    this.db.prepare('DELETE FROM audit_logs WHERE user_id = ?').run(userId);
    this.db.prepare('DELETE FROM token_blacklist WHERE user_id = ?').run(userId);
    // Delete user record last to maintain referential integrity during deletion
    this.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  }

  // Token blacklist operations
  async blacklistToken(userId, tokenJti, expiresAt, reason = 'logout') {
    const stmt = this.db.prepare('INSERT INTO token_blacklist (user_id, token_jti, expires_at, reason) VALUES (?, ?, ?, ?)');
    stmt.run(userId, tokenJti, expiresAt, reason);
  }

  async isTokenBlacklisted(tokenJti) {
    const stmt = this.db.prepare('SELECT 1 FROM token_blacklist WHERE token_jti = ?');
    return !!stmt.get(tokenJti);
  }

  async blacklistAllUserTokens(userId, reason = 'logout_all') {
    // Blacklist all potential tokens for this user by recording user logout
    const stmt = this.db.prepare('INSERT INTO token_blacklist (user_id, token_jti, expires_at, reason) VALUES (?, ?, ?, ?)');
    const expiresAt = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60);
    stmt.run(userId, `user_${userId}_${Date.now()}`, expiresAt, reason);
  }

  async cleanupExpiredBlacklist() {
    const now = Math.floor(Date.now() / 1000);
    const stmt = this.db.prepare('DELETE FROM token_blacklist WHERE expires_at < ?');
    const result = stmt.run(now);
    return result.changes;
  }

  async getUserBlacklistTimestamp(userId) {
    const stmt = this.db.prepare('SELECT MAX(blacklisted_at) as timestamp FROM token_blacklist WHERE user_id = ?');
    const result = stmt.get(userId);
    return result?.timestamp || 0;
  }
}
