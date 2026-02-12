export class Database {
  constructor(db) {
    this.db = db;
  }

  prepare(statement, params = []) {
    const prepared = this.db.prepare(statement);
    return params.length ? prepared.bind(...params) : prepared;
  }

  async run(statement, ...params) {
    return this.prepare(statement, params).run();
  }

  async first(statement, ...params) {
    return this.prepare(statement, params).first();
  }

  async all(statement, ...params) {
    const result = await this.prepare(statement, params).all();
    return result?.results ?? [];
  }

  // User operations
  async createUser(email, passphraseHash, tier = 'free') {
    const result = await this.run(
      'INSERT INTO users (email, passphrase_hash, tier) VALUES (?, ?, ?)',
      email,
      passphraseHash,
      tier
    );
    return Number(result?.meta?.last_row_id);
  }

  async getUserByEmail(email) {
    return this.first('SELECT * FROM users WHERE email = ?', email);
  }

  async getUserById(id) {
    return this.first('SELECT * FROM users WHERE id = ?', id);
  }

  async updateUserSettings(userId, shareMappings) {
    await this.run(
      'UPDATE users SET share_mappings = ? WHERE id = ?',
      shareMappings ? 1 : 0,
      userId
    );
  }

  // Device operations
  async registerDevice(userId, deviceId, name) {
    await this.run(
      'INSERT INTO devices (user_id, device_id, name) VALUES (?, ?, ?) ON CONFLICT(device_id) DO UPDATE SET last_seen = strftime(\'%s\', \'now\')',
      userId,
      deviceId,
      name
    );
  }

  async getDevicesByUser(userId) {
    return this.all(
      'SELECT * FROM devices WHERE user_id = ? ORDER BY last_seen DESC',
      userId
    );
  }

  async getDeviceCount(userId) {
    const result = await this.first('SELECT COUNT(*) as count FROM devices WHERE user_id = ?', userId);
    return Number(result?.count ?? 0);
  }

  async registerDeviceWithLimit(userId, deviceId, name, limit) {
    const existingDevices = await this.all(
      'SELECT device_id FROM devices WHERE user_id = ?',
      userId
    );
    const deviceExists = existingDevices.some(d => d.device_id === deviceId);

    if (!deviceExists && existingDevices.length >= limit) {
      return { ok: false, deviceExists, count: existingDevices.length };
    }

    await this.run(
      'INSERT INTO devices (user_id, device_id, name) VALUES (?, ?, ?) ON CONFLICT(device_id) DO UPDATE SET last_seen = strftime(\'%s\', \'now\')',
      userId,
      deviceId,
      name
    );

    return { ok: true, deviceExists, count: existingDevices.length };
  }

  async deleteDevice(deviceId, userId) {
    await this.run('DELETE FROM devices WHERE device_id = ? AND user_id = ?', deviceId, userId);
  }

  // Sync operations
  async getSyncBlob(userId) {
    const result = await this.first('SELECT * FROM sync_blobs WHERE user_id = ?', userId);
    return result || null;
  }

  async upsertSyncBlob(userId, version, encryptedData) {
    await this.run(
      `
        INSERT INTO sync_blobs (user_id, version, encrypted_data, updated_at) 
        VALUES (?, ?, ?, strftime('%s', 'now'))
        ON CONFLICT(user_id) DO UPDATE SET 
          version = excluded.version,
          encrypted_data = excluded.encrypted_data,
          updated_at = excluded.updated_at
      `,
      userId,
      version,
      JSON.stringify(encryptedData)
    );
  }

  // SECURITY: Atomic version check to prevent TOCTOU race conditions
  async upsertSyncBlobAtomic(userId, version, encryptedData) {
    const result = await this.run(
      `
        INSERT INTO sync_blobs (user_id, version, encrypted_data, updated_at)
        VALUES (?, ?, ?, strftime('%s', 'now'))
        ON CONFLICT(user_id) DO UPDATE SET
          version = excluded.version,
          encrypted_data = excluded.encrypted_data,
          updated_at = excluded.updated_at
        WHERE sync_blobs.version < excluded.version
      `,
      userId,
      version,
      JSON.stringify(encryptedData)
    );

    return result?.meta?.changes ?? 0;
  }

  // Shared mappings operations
  async getSharedMappings(cardType) {
    return this.all('SELECT * FROM shared_mappings WHERE card_type = ? AND status = ?', cardType, 'approved');
  }

  async contributeMappings(userId, mappings) {
    const insertSql = 'INSERT INTO mapping_contributions (user_id, merchant_raw, category, card_type) VALUES (?, ?, ?, ?)';

    for (const mapping of mappings) {
      const merchantRaw = mapping.merchantRaw || mapping.merchantNormalized || mapping.merchant;
      await this.run(insertSql, userId, merchantRaw, mapping.category, mapping.cardType);
    }
  }

  async getPendingContributions() {
    return this.all(
      `
        SELECT mc.merchant_raw, mc.category, mc.card_type, COUNT(*) as count
        FROM mapping_contributions mc
        LEFT JOIN shared_mappings sm ON mc.merchant_raw = sm.merchant_normalized AND mc.card_type = sm.card_type
        WHERE sm.id IS NULL
        GROUP BY mc.merchant_raw, mc.category, mc.card_type
        ORDER BY count DESC
      `
    );
  }

  async approveMappings(merchantNormalized, category, cardType) {
    await this.run(
      `
        INSERT INTO shared_mappings (merchant_normalized, suggested_category, card_type, status, contribution_count)
        VALUES (?, ?, ?, 'approved', 1)
        ON CONFLICT(merchant_normalized, card_type) DO UPDATE SET
          suggested_category = excluded.suggested_category,
          status = 'approved',
          updated_at = strftime('%s', 'now')
      `,
      merchantNormalized,
      category,
      cardType
    );
  }

  // User data deletion - GDPR compliant full deletion
  async deleteUserData(userId) {
    await this.run('DELETE FROM sync_blobs WHERE user_id = ?', userId);
    await this.run('DELETE FROM devices WHERE user_id = ?', userId);
    await this.run('DELETE FROM mapping_contributions WHERE user_id = ?', userId);
    await this.run('DELETE FROM audit_logs WHERE user_id = ?', userId);
    await this.run('DELETE FROM token_blacklist WHERE user_id = ?', userId);
    await this.run('DELETE FROM users WHERE id = ?', userId);
  }

  // Token blacklist operations
  async blacklistToken(userId, tokenJti, expiresAt, reason = 'logout') {
    await this.run(
      'INSERT INTO token_blacklist (user_id, token_jti, expires_at, reason) VALUES (?, ?, ?, ?)',
      userId,
      tokenJti,
      expiresAt,
      reason
    );
  }

  async isTokenBlacklisted(tokenJti) {
    const result = await this.first('SELECT 1 FROM token_blacklist WHERE token_jti = ?', tokenJti);
    return !!result;
  }

  async blacklistAllUserTokens(userId, reason = 'logout_all') {
    const expiresAt = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60);
    await this.run(
      'INSERT INTO token_blacklist (user_id, token_jti, expires_at, reason) VALUES (?, ?, ?, ?)',
      userId,
      `user_${userId}_${Date.now()}`,
      expiresAt,
      reason
    );
  }

  // Refresh token operations
  async createRefreshToken(userId, tokenHash, familyId, expiresAt, parentId = null) {
    const result = await this.run(
      `
        INSERT INTO refresh_tokens (
          user_id,
          token_hash,
          family_id,
          parent_id,
          expires_at
        )
        VALUES (?, ?, ?, ?, ?)
      `,
      userId,
      tokenHash,
      familyId,
      parentId,
      expiresAt
    );
    return Number(result?.meta?.last_row_id);
  }

  async getRefreshTokenByHash(tokenHash) {
    return this.first('SELECT * FROM refresh_tokens WHERE token_hash = ?', tokenHash);
  }

  async markRefreshTokenRotated(id, replacedBy) {
    const result = await this.run(
      `
        UPDATE refresh_tokens
        SET replaced_by = ?, rotated_at = strftime('%s', 'now')
        WHERE id = ? AND replaced_by IS NULL AND revoked_at IS NULL
      `,
      replacedBy,
      id
    );
    return result?.meta?.changes ?? 0;
  }

  async revokeRefreshToken(id, reason = 'revoked') {
    await this.run(
      `
        UPDATE refresh_tokens
        SET revoked_at = strftime('%s', 'now'), revoked_reason = ?
        WHERE id = ?
      `,
      reason,
      id
    );
  }

  async revokeRefreshTokenFamily(familyId, reason = 'revoked') {
    await this.run(
      `
        UPDATE refresh_tokens
        SET revoked_at = strftime('%s', 'now'), revoked_reason = ?
        WHERE family_id = ? AND revoked_at IS NULL
      `,
      reason,
      familyId
    );
  }

  async revokeAllRefreshTokens(userId, reason = 'logout_all') {
    await this.run(
      `
        UPDATE refresh_tokens
        SET revoked_at = strftime('%s', 'now'), revoked_reason = ?
        WHERE user_id = ? AND revoked_at IS NULL
      `,
      reason,
      userId
    );
  }

  async cleanupExpiredBlacklist() {
    const now = Math.floor(Date.now() / 1000);
    const result = await this.run('DELETE FROM token_blacklist WHERE expires_at < ?', now);
    return result?.meta?.changes ?? 0;
  }

  async cleanupExpiredRefreshTokens() {
    const now = Math.floor(Date.now() / 1000);
    const result = await this.run('DELETE FROM refresh_tokens WHERE expires_at < ?', now);
    return result?.meta?.changes ?? 0;
  }

  async getUserBlacklistTimestamp(userId) {
    const result = await this.first(
      'SELECT MAX(blacklisted_at) as timestamp FROM token_blacklist WHERE user_id = ?',
      userId
    );
    return result?.timestamp || 0;
  }
}
