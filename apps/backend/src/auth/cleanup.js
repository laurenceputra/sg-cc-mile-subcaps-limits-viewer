/**
 * Cleanup Jobs for Security
 * 
 * Periodic maintenance tasks:
 * - Clean up expired token blacklist entries
 * - Rotate audit logs (90-day retention)
 */

import { rotateAuditLogs } from '../audit/logger.js';

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
    return {
      success: true,
      blacklistCleaned,
      auditLogsCleaned
    };
  } catch (error) {
    console.error('[Cleanup] Error during cleanup jobs:', error);
    return {
      success: false,
      error: error.message
    };
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
  
  setInterval(async () => {
    await runCleanupJobs(db);
  }, CLEANUP_INTERVAL);
  
  // Run immediately on startup
  runCleanupJobs(db).catch(err => {
    console.error('[Cleanup] Failed to run initial cleanup:', err);
  });
  
  console.log('[Cleanup] Cleanup schedule initialized');
}
