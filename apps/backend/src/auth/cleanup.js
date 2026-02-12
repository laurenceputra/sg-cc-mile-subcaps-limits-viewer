/**
 * Cleanup Jobs for Security
 * 
 * Periodic maintenance tasks:
 * - Clean up expired token blacklist entries
 * - Rotate audit logs (90-day retention)
 */

import { rotateAuditLogs } from '../audit/logger.js';

// Health monitoring state
let lastCleanupTimestamp = null;
let lastCleanupResult = null;

/**
 * Get cleanup health status
 */
export function getCleanupHealth() {
  return {
    lastCleanup: lastCleanupTimestamp,
    lastResult: lastCleanupResult,
    isHealthy: lastCleanupTimestamp && (Date.now() - lastCleanupTimestamp < 48 * 60 * 60 * 1000) // Within 48 hours
  };
}

/**
 * Run all cleanup jobs
 * Should be called via Cloudflare Workers scheduled handler
 * 
 * @param {object} db - Database instance
 */
export async function runCleanupJobs(db) {
  console.log('[Cleanup] Starting cleanup jobs...');
  
  try {
    // Clean up expired blacklist entries
    const blacklistCleaned = await db.cleanupExpiredBlacklist();
    console.log(`[Cleanup] Removed ${blacklistCleaned} expired blacklist entries`);

    // Clean up expired refresh tokens
    const refreshTokensCleaned = await db.cleanupExpiredRefreshTokens();
    console.log(`[Cleanup] Removed ${refreshTokensCleaned} expired refresh tokens`);
    
    // Rotate audit logs (90-day retention)
    const auditLogsCleaned = await rotateAuditLogs(db, 90);
    console.log(`[Cleanup] Removed ${auditLogsCleaned} old audit log entries`);
    
    console.log('[Cleanup] Cleanup jobs completed successfully');
    
    // Update health status
    lastCleanupTimestamp = Date.now();
    lastCleanupResult = {
      success: true,
      blacklistCleaned,
      refreshTokensCleaned,
      auditLogsCleaned
    };
    
    return lastCleanupResult;
  } catch (error) {
    console.error('[Cleanup] Error during cleanup jobs:', error);
    
    // Update health status with error
    lastCleanupTimestamp = Date.now();
    lastCleanupResult = {
      success: false,
      error: error.message
    };
    
    return lastCleanupResult;
  }
}
