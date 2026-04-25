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

  async rotateRefreshToken(id, userId, tokenHash, familyId, expiresAt) {
    if (typeof this.db.batch === 'function') {
      const results = await this.db.batch([
        this.db.prepare(`
          UPDATE refresh_tokens
          SET replaced_by = ?, rotated_at = strftime('%s', 'now')
          WHERE id = ? AND replaced_by IS NULL AND revoked_at IS NULL
        `).bind(tokenHash, id),
        this.db.prepare(`
          INSERT INTO refresh_tokens (
            user_id,
            token_hash,
            family_id,
            parent_id,
            expires_at
          )
          SELECT ?, ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM refresh_tokens
            WHERE id = ? AND replaced_by = ? AND revoked_at IS NULL
          )
        `).bind(userId, tokenHash, familyId, id, expiresAt, id, tokenHash)
      ]);
      const inserted = results?.[1]?.meta?.changes ?? 0;
      return inserted > 0 ? Number(results?.[1]?.meta?.last_row_id) : null;
    }

    const rotated = await this.markRefreshTokenRotated(id, tokenHash);
    if (rotated === 0) {
      return null;
    }
    return this.createRefreshToken(userId, tokenHash, familyId, expiresAt, id);
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
      "SELECT MAX(blacklisted_at) as timestamp FROM token_blacklist WHERE user_id = ? AND reason = 'logout_all'",
      userId
    );
    return result?.timestamp || 0;
  }
}
