import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from '../../middleware/rate-limiter-worker.js';
import { createTestEnv } from './test-utils.js';

function createMockContext({ limitResult }) {
  const env = createTestEnv({ JWT_SECRET: 'test-secret' });
  env.RATE_LIMIT_LOGIN = {
    async limit() {
      return limitResult;
    }
  };

  return {
    env,
    req: {
      header: () => null,
      method: 'POST',
      path: '/auth/login'
    },
    get: () => null,
    set: () => {},
    header: () => {},
    json: (payload, status = 200) => ({ payload, status })
  };
}

describe('Workers rate limiter adapter', () => {
  test('allows requests when limiter succeeds', async () => {
    const limiter = createRateLimiter('login', {
      maxAttempts: 5,
      windowMs: 60 * 1000
    });

    const c = createMockContext({ limitResult: { success: true, remaining: 4 } });
    const res = await limiter(c, async () => ({ ok: true }));

    assert.equal(res, undefined);
  });

  test('returns 429 when limiter blocks', async () => {
    const limiter = createRateLimiter('login', {
      maxAttempts: 5,
      windowMs: 60 * 1000
    });

    const c = createMockContext({ limitResult: { success: false, remaining: 0 } });
    const res = await limiter(c, async () => ({ ok: true }));

    assert.equal(res.status, 429);
    assert.ok(res.payload.error.includes('Too many'));
  });
});
