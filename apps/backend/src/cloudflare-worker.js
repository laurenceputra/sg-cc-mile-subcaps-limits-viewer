import app from './index.js';
import { Database } from './storage/db.js';
import { validateEnvironment } from './startup-validation.js';

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
  }
};
