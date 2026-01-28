/**
 * Test Setup & Utilities
 * Common utilities for all test suites
 */

import crypto from 'crypto';
import { Database } from '../storage/db.js';
import BetterSqlite3 from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test database path
const TEST_DB_PATH = ':memory:';

/**
 * Create a test database instance with schema
 */
export function createTestDb() {
  const sqliteDb = new BetterSqlite3(TEST_DB_PATH);
  
  // Load and execute schema
  const schemaPath = join(__dirname, '../storage/schema.sql');
  const schema = readFileSync(schemaPath, 'utf8');
  sqliteDb.exec(schema);
  
  return new Database(sqliteDb);
}

/**
 * Generate a random email for testing
 */
export function randomEmail() {
  return `test-${crypto.randomBytes(8).toString('hex')}@example.com`;
}

/**
 * Generate a password hash (simple for testing)
 */
export function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * Create a test user
 */
export async function createTestUser(db, options = {}) {
  const email = options.email || randomEmail();
  const password = options.password || 'testpass123';
  const passwordHash = hashPassword(password);
  const tier = options.tier || 'free';
  
  const userId = await db.createUser(email, passwordHash, tier);
  
  return {
    userId,
    email,
    password,
    passwordHash,
    tier
  };
}

/**
 * Create test environment variables
 */
export function createTestEnv(overrides = {}) {
  return {
    JWT_SECRET: 'test-secret-key-for-testing-only',
    ADMIN_KEY: 'test-admin-key-123',
    ALLOWED_ORIGINS: 'https://pib.uob.com.sg,https://test.example.com',
    ENVIRONMENT: 'test',
    NODE_ENV: 'test',
    ...overrides
  };
}

/**
 * Wait for a specified duration
 */
export function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate encrypted test data
 */
export function generateEncryptedData(version = 1) {
  return {
    ciphertext: crypto.randomBytes(64).toString('base64'),
    iv: crypto.randomBytes(16).toString('base64'),
    salt: crypto.randomBytes(32).toString('base64'),
    version
  };
}

/**
 * Clean up test database
 */
export async function cleanupTestDb(db) {
  if (db && db.db && typeof db.db.close === 'function') {
    db.db.close();
  }
}

/**
 * Mock request object for testing
 */
export function mockRequest(options = {}) {
  const headers = new Map(Object.entries(options.headers || {}));
  
  return {
    url: options.url || 'https://api.test.com/test',
    method: options.method || 'GET',
    headers: {
      get: (key) => headers.get(key.toLowerCase()),
      set: (key, value) => headers.set(key.toLowerCase(), value),
      has: (key) => headers.has(key.toLowerCase()),
      delete: (key) => headers.delete(key.toLowerCase()),
      entries: () => headers.entries(),
      keys: () => headers.keys(),
      values: () => headers.values()
    },
    cf: {
      country: 'US'
    }
  };
}

/**
 * Extract rate limit info from response headers
 */
export function extractRateLimitInfo(headers) {
  return {
    limit: parseInt(headers['x-ratelimit-limit']) || null,
    remaining: parseInt(headers['x-ratelimit-remaining']) || null,
    reset: parseInt(headers['x-ratelimit-reset']) || null,
    retryAfter: parseInt(headers['retry-after']) || null
  };
}
