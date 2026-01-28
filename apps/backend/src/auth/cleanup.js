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
let cleanupInterval = null;

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
 * Should be called daily via cron or scheduled task
 * 
 * @param {object} db - Database instance
 */
export async function runCleanupJobs(db) {
  console.log('[Cleanup] Starting cleanup jobs...');
  
  try {
    // Clean up expired blacklist entries
    const blacklistCleaned = await db.cleanupExpiredBlacklist();
    console.log(`[Cleanup] Removed ${blacklistCleaned} expired blacklist entries`);
    
    // Rotate audit logs (90-day retention)
    const auditLogsCleaned = await rotateAuditLogs(db, 90);
    console.log(`[Cleanup] Removed ${auditLogsCleaned} old audit log entries`);
    
    console.log('[Cleanup] Cleanup jobs completed successfully');
    
    // Update health status
    lastCleanupTimestamp = Date.now();
    lastCleanupResult = {
      success: true,
      blacklistCleaned,
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
    
    // SECURITY: Alert on cleanup failure (in production, integrate with alerting service)
    if (process.env.NODE_ENV === 'production') {
      console.error('[ALERT] Cleanup job failed - manual intervention may be required');
    }
    
    return lastCleanupResult;
  }
}

/**
 * Initialize cleanup schedule (if running in Node.js with cron)
 * For Cloudflare Workers, use Scheduled Workers instead
 * 
 * @param {object} db - Database instance
 */
export function initCleanupSchedule(db) {
  // Run cleanup daily at 2 AM
  const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
  
  // SECURITY: Monitor cleanup interval health
  cleanupInterval = setInterval(async () => {
    try {
      await runCleanupJobs(db);
    } catch (error) {
      console.error('[Cleanup] Interval handler error:', error);
    }
  }, CLEANUP_INTERVAL);
  
  // Run immediately on startup
  runCleanupJobs(db).catch(err => {
    console.error('[Cleanup] Failed to run initial cleanup:', err);
  });
  
  console.log('[Cleanup] Cleanup schedule initialized');
}

/**
 * Stop cleanup schedule (for graceful shutdown)
 */
export function stopCleanupSchedule() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log('[Cleanup] Cleanup schedule stopped');
  }
}
