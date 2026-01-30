import { serve } from '@hono/node-server';
import SQLite from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import app from './index.js';
import { Database } from './storage/db.js';
import { validateEnvironment } from './startup-validation.js';
import { initCleanupSchedule } from './auth/cleanup.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(__dirname, '../data/bank-cc-sync.db');

// Validate environment configuration before starting
const env = {
  JWT_SECRET: process.env.JWT_SECRET,
  ADMIN_KEY: process.env.ADMIN_KEY,
  NODE_ENV: process.env.NODE_ENV,
  ENVIRONMENT: process.env.ENVIRONMENT
};

try {
  validateEnvironment(env);
} catch (error) {
  console.error('Failed to start server:', error.message);
  process.exit(1);
}

// Initialize SQLite database
const sqliteDb = new SQLite(dbPath);

// Run schema
const schema = readFileSync(join(__dirname, 'storage/schema.sql'), 'utf-8');
sqliteDb.exec(schema);

const db = new Database(sqliteDb);

// Initialize cleanup jobs for token blacklist and audit logs
initCleanupSchedule(db);

// Wrap Hono app with db context
serve({
  fetch: (request) => {
    return app.fetch(request, {
      db,
      JWT_SECRET: process.env.JWT_SECRET,
      ADMIN_KEY: process.env.ADMIN_KEY
    });
  },
  port: 3000
});

console.log('🚀 Server running on http://localhost:3000');
