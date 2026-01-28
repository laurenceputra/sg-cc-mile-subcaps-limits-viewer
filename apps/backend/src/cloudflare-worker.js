import app from './index.js';
import { Database } from './storage/db.js';

export default {
  async fetch(request, env, ctx) {
    const db = new Database(env.DB);
    
    return app.fetch(request, { ...env, db });
  }
};
