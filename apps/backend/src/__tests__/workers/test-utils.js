import { Miniflare } from 'miniflare';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Database } from '../../storage/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const schemaPath = join(__dirname, '../../storage/schema.sql');
const schemaSql = readFileSync(schemaPath, 'utf8');

async function applySchema(db) {
  const statements = schemaSql
    .split(';')
    .map(statement => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await db.prepare(statement).run();
  }
}

export async function createTestDatabase() {
  const mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("ok"); } }',
    d1Databases: { DB: 'BANK_CC_SYNC' }
  });

  const d1 = await mf.getD1Database('DB');
  await applySchema(d1);

  return { mf, db: new Database(d1) };
}

export function createTestEnv(overrides = {}) {
  return {
    JWT_SECRET: 'test-secret-key-for-testing-only',
    ADMIN_KEY: 'test-admin-key-123',
    DUMMY_PASSWORD_HASH: '0'.repeat(64),
    ALLOWED_ORIGINS: 'https://pib.uob.com.sg',
    ENVIRONMENT: 'development',
    NODE_ENV: 'test',
    ...overrides
  };
}

export async function disposeTestDatabase(mf) {
  if (mf) {
    await mf.dispose();
  }
}
