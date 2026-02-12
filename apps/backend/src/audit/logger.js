/**
 * Audit Logging Module
 * 
 * Logs security-relevant events for compliance and forensics.
 * - All logs are sanitized (no passwords, tokens, or sensitive PII)
 * - Logs are automatically rotated (90-day retention)
 * - IP addresses and user agents are captured for forensics
 */

export const AuditEventType = {
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAILED: 'login_failed',
  REGISTER_SUCCESS: 'register_success',
  LOGOUT: 'logout',
  LOGOUT_ALL: 'logout_all',
  DEVICE_REGISTER: 'device_register',
  DEVICE_REMOVE: 'device_remove',
  DATA_EXPORT: 'data_export',
  DATA_DELETE: 'data_delete',
  SETTINGS_CHANGE: 'settings_change',
  ADMIN_LOGIN_SUCCESS: 'admin_login_success',
  ADMIN_LOGIN_FAILED: 'admin_login_failed',
  ADMIN_TOKEN_REJECTED: 'admin_token_rejected',
  ADMIN_MAPPING_APPROVE: 'admin_mapping_approve',
  ADMIN_VIEW_PENDING: 'admin_view_pending',
  ADMIN_HEALTH_CHECK: 'admin_health_check',
  REFRESH_TOKEN_REUSE: 'refresh_token_reuse'
};

/**
 * Sanitize details object to remove any sensitive information
 * @param {object} details - Raw details object
 * @returns {object} - Sanitized details
 */
function sanitizeDetails(details) {
  const sanitized = { ...details };
  
  // Remove any potentially sensitive fields
  const sensitiveFields = [
    'password', 'passwordHash', 'passphrase', 'passphraseHash',
    'token', 'jwt', 'secret', 'key', 'apiKey',
    'encryptedData', 'encrypted_data', 'ciphertext',
    'salt', 'iv', 'nonce'
  ];
  
  for (const field of sensitiveFields) {
    if (field in sanitized) {
      delete sanitized[field];
    }
  }
  
  return sanitized;
}

/**
 * Extract client IP from request headers
 * Handles various proxy headers (Cloudflare, standard proxies)
 */
function getClientIp(request) {
  // Check common proxy headers
  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  if (cfConnectingIp) return cfConnectingIp;
  
  const xForwardedFor = request.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    // Take first IP if multiple
    return xForwardedFor.split(',')[0].trim();
  }
  
  const xRealIp = request.headers.get('x-real-ip');
  if (xRealIp) return xRealIp;
  
  // Fallback (may not be available in all environments)
  return 'unknown';
}

/**
 * Log an audit event to the database
 * 
 * @param {object} db - Database instance
 * @param {object} params - Audit log parameters
 * @param {string} params.eventType - Type of event (use AuditEventType constants)
 * @param {Request} params.request - HTTP request object (for IP/user-agent extraction)
 * @param {number} [params.userId] - User ID (null for failed logins)
 * @param {string} [params.deviceId] - Device ID (for device-related events)
 * @param {object} [params.details] - Additional event-specific details (will be sanitized)
 */
export async function logAuditEvent(db, { eventType, request, userId = null, deviceId = null, details = {} }) {
  try {
    if (userId !== null) {
      const exists = await db.db.prepare('SELECT 1 FROM users WHERE id = ?').bind(userId).first();
      if (!exists) {
        userId = null;
      }
    }
    const ipAddress = getClientIp(request);
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const sanitizedDetails = sanitizeDetails(details);
    
    const stmt = db.db.prepare(`
      INSERT INTO audit_logs (event_type, user_id, ip_address, user_agent, device_id, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    await stmt.bind(
      eventType,
      userId,
      ipAddress,
      userAgent,
      deviceId,
      JSON.stringify(sanitizedDetails)
    ).run();
  } catch (error) {
    // Never throw from audit logging - log error but continue
    console.error('[Audit] Failed to log event:', error);
  }
}

/**
 * Clean up old audit logs (90-day retention policy)
 * Should be called periodically (e.g., daily cron job)
 * 
 * @param {object} db - Database instance
 * @param {number} [retentionDays=90] - Number of days to retain logs
 */
export async function rotateAuditLogs(db, retentionDays = 90) {
  try {
    const cutoffTimestamp = Math.floor(Date.now() / 1000) - (retentionDays * 24 * 60 * 60);
    
    const stmt = db.db.prepare('DELETE FROM audit_logs WHERE created_at < ?');
    const result = await stmt.bind(cutoffTimestamp).run();
    
    const changes = result?.meta?.changes ?? 0;
    console.log(`[Audit] Rotated audit logs: ${changes} records deleted (retention: ${retentionDays} days)`);
    return changes;
  } catch (error) {
    console.error('[Audit] Failed to rotate logs:', error);
    throw error;
  }
}

/**
 * Get audit logs for a specific user (for security review)
 * 
 * @param {object} db - Database instance
 * @param {number} userId - User ID
 * @param {number} [limit=100] - Maximum number of logs to return
 * @returns {Array} - Array of audit log entries
 */
export async function getUserAuditLogs(db, userId, limit = 100) {
  const stmt = db.db.prepare(`
    SELECT event_type, ip_address, user_agent, device_id, details, created_at
    FROM audit_logs
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);

  const result = await stmt.bind(userId, limit).all();
  return result?.results ?? [];
}

/**
 * Get recent failed login attempts for monitoring
 * 
 * @param {object} db - Database instance
 * @param {number} [minutes=60] - Time window in minutes
 * @returns {Array} - Array of failed login attempts grouped by IP
 */
export async function getRecentFailedLogins(db, minutes = 60) {
  const cutoffTimestamp = Math.floor(Date.now() / 1000) - (minutes * 60);
  
  const stmt = db.db.prepare(`
    SELECT ip_address, COUNT(*) as attempt_count, MAX(created_at) as last_attempt
    FROM audit_logs
    WHERE event_type = ? AND created_at > ?
    GROUP BY ip_address
    ORDER BY attempt_count DESC
  `);

  const result = await stmt.bind(AuditEventType.LOGIN_FAILED, cutoffTimestamp).all();
  return result?.results ?? [];
}
