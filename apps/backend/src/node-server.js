import { serve } from '@hono/node-server';
import SQLite from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import app from './index.js';
import { Database } from './storage/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(__dirname, '../data/bank-cc-sync.db');

// Initialize SQLite database
const sqliteDb = new SQLite(dbPath);

// Run schema
const schema = readFileSync(join(__dirname, 'storage/schema.sql'), 'utf-8');
sqliteDb.exec(schema);

const db = new Database(sqliteDb);

// Wrap Hono app with db context
const server = serve({
  fetch: (request) => {
    return app.fetch(request, {
      db,
      JWT_SECRET: process.env.JWT_SECRET || 'dev-secret',
      ADMIN_KEY: process.env.ADMIN_KEY || 'admin-dev-key'
    });
  },
  port: 3000
});

console.log('🚀 Server running on http://localhost:3000');
