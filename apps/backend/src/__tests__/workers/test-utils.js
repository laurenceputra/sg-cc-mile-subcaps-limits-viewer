import { Miniflare } from 'miniflare';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Database } from '../../storage/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const schemaPath = join(__dirname, '../../storage/schema.sql');
const schemaSql = readFileSync(schemaPath, 'utf8');

export const TEST_ADMIN_EMAIL = 'admin@example.com';
export const TEST_ADMIN_PASSWORD = 'test-admin-password';
const DEFAULT_TEST_ORIGIN = 'https://pib.uob.com.sg';
const TEST_ADMIN_PEPPER = 'test-admin-pepper';
const TEST_ADMIN_PASSWORD_HASH = crypto
  .createHash('sha256')
  .update(`${TEST_ADMIN_PASSWORD}:${TEST_ADMIN_PEPPER}`)
  .digest('hex');

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
    ADMIN_LOGIN_PASSWORD_HASH: TEST_ADMIN_PASSWORD_HASH,
    ADMIN_LOGIN_PEPPER: TEST_ADMIN_PEPPER,
    DUMMY_PASSWORD_HASH: '0'.repeat(64),
    ALLOWED_ORIGINS: 'https://pib.uob.com.sg,https://cib.maybank2u.com.sg',
    ENVIRONMENT: 'development',
    NODE_ENV: 'test',
    ...overrides
  };
}

export function expectStatus(response, expectedStatus, context = 'request') {
  assert.equal(response.status, expectedStatus, `${context} should return ${expectedStatus}`);
  return response;
}

export function expectOk(response, context = 'request') {
  assert.equal(response.ok, true, `${context} should be successful`);
  return response;
}

export async function expectJsonResponse(response, expectedStatus, context = 'request') {
  expectStatus(response, expectedStatus, context);
  return response.json();
}

export function expectJwtLike(token, context = 'token') {
  assert.equal(typeof token, 'string', `${context} should be a string`);
  const parts = token.split('.');
  assert.equal(parts.length, 3, `${context} should have three JWT segments`);
  for (const part of parts) {
    assert.match(part, /^[A-Za-z0-9_-]+$/, `${context} segment should be base64url-like`);
  }
}

export function createJsonRequest(path, options = {}) {
  const {
    method = 'GET',
    origin = DEFAULT_TEST_ORIGIN,
    token,
    headers = {},
    body
  } = options;
  const requestHeaders = new Headers(headers);

  if (origin !== null) {
    requestHeaders.set('Origin', origin);
  }

  if (token) {
    requestHeaders.set('Authorization', `Bearer ${token}`);
  }

  let requestBody;
  if (body !== undefined) {
    requestHeaders.set('Content-Type', 'application/json');
    requestBody = JSON.stringify(body);
  }

  return new Request(`http://localhost${path}`, {
    method,
    headers: requestHeaders,
    body: requestBody
  });
}

export async function fetchJson(app, env, path, options = {}, expectedStatus = 200, context = path) {
  const response = await app.fetch(createJsonRequest(path, options), env);
  const json = await expectJsonResponse(response, expectedStatus, context);
  return { response, json };
}

export async function disposeTestDatabase(mf) {
  if (mf) {
    await mf.dispose();
  }
}
