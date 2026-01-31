import app from './index.js';
import { Database } from './storage/db.js';
import { validateEnvironment } from './startup-validation.js';
import { runCleanupJobs } from './auth/cleanup.js';

export default {
  async fetch(request, env, ctx) {
    // Validate environment on first request (Cloudflare Workers don't have a startup phase)
    // In production, this should be done during deployment validation
    try {
      validateEnvironment(env, true);
    } catch (error) {
      console.error('Environment validation failed:', error.message);
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }), 
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const db = new Database(env.DB);
    
    return app.fetch(request, { ...env, db });
  },

  // SECURITY FIX: Scheduled handler for Cloudflare Workers Cron Triggers
  // Configure in wrangler.toml:
  // [triggers]
  // crons = ["0 2 * * *"]  # Daily at 2 AM UTC
  async scheduled(event, env, ctx) {
    console.log('[Cloudflare Worker] Running scheduled cleanup job');
    
    const db = new Database(env.DB);
    
    // Use ctx.waitUntil to ensure cleanup completes even after worker response
    ctx.waitUntil(
      runCleanupJobs(db)
        .then(result => {
          console.log('[Cloudflare Worker] Cleanup completed:', result);
        })
        .catch(error => {
          console.error('[Cloudflare Worker] Cleanup failed:', error);
          // In production, send alert to monitoring service
        })
    );
  }
};
