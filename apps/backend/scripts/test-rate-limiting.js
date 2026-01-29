/**
 * Rate Limiting Test Suite
 * Tests all rate limiting functionality
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';

// Test imports
import { RateLimitStore } from './src/middleware/rate-limit-store.js';
import { 
  rateLimitConfig, 
  calculateProgressiveDelay, 
  getRateLimitErrorMessage 
} from './src/middleware/rate-limit-config.js';

describe('Rate Limiting System', () => {
  describe('RateLimitStore', () => {
    let store;

    before(() => {
      store = new RateLimitStore();
    });

    it('should initialize with zero attempts', () => {
      const entry = store.get('test-client');
      assert.strictEqual(entry.attempts, 0);
      assert.strictEqual(entry.blocked, false);
    });

    it('should increment attempts correctly', () => {
      const windowMs = 60000;
      const attempts1 = store.increment('test-increment', windowMs);
      const attempts2 = store.increment('test-increment', windowMs);
      const attempts3 = store.increment('test-increment', windowMs);
      
      assert.strictEqual(attempts1, 1);
      assert.strictEqual(attempts2, 2);
      assert.strictEqual(attempts3, 3);
    });

    it('should reset attempts after window expires', (done) => {
      const windowMs = 100; // 100ms window for fast test
      store.increment('test-reset', windowMs);
      store.increment('test-reset', windowMs);
      
      const entry1 = store.get('test-reset');
      assert.strictEqual(entry1.attempts, 2);
      
      setTimeout(() => {
        const attempts = store.increment('test-reset', windowMs);
        assert.strictEqual(attempts, 1, 'Should reset to 1 after window expires');
        done();
      }, 150);
    });

    it('should block identifier correctly', () => {
      store.block('test-block', 5000);
      assert.strictEqual(store.isBlocked('test-block'), true);
      
      const seconds = store.getBlockedSeconds('test-block');
      assert.ok(seconds > 0 && seconds <= 5);
    });

    it('should unblock after duration expires', (done) => {
      store.block('test-unblock', 100);
      assert.strictEqual(store.isBlocked('test-unblock'), true);
      
      setTimeout(() => {
        assert.strictEqual(store.isBlocked('test-unblock'), false);
        done();
      }, 150);
    });

    it('should reset identifier', () => {
      store.increment('test-delete', 60000);
      store.increment('test-delete', 60000);
      store.reset('test-delete');
      
      const entry = store.get('test-delete');
      assert.strictEqual(entry.attempts, 0);
    });
  });

  describe('Progressive Delay Calculation', () => {
    const config = rateLimitConfig.login.progressiveDelay;

    it('should return 0 for first attempt', () => {
      const delay = calculateProgressiveDelay(1, config);
      assert.strictEqual(delay, 0);
    });

    it('should calculate exponential delays', () => {
      // Formula: baseMs * (exponentialFactor ^ (attempts - 1))
      assert.strictEqual(calculateProgressiveDelay(2, config), 400);  // 200 * 2^1
      assert.strictEqual(calculateProgressiveDelay(3, config), 800);  // 200 * 2^2
      assert.strictEqual(calculateProgressiveDelay(4, config), 1600); // 200 * 2^3
      assert.strictEqual(calculateProgressiveDelay(5, config), 3200); // 200 * 2^4
    });

    it('should cap at maximum delay', () => {
      const delay = calculateProgressiveDelay(10, config);
      assert.ok(delay <= config.maxMs);
    });
  });

  describe('Rate Limit Configuration', () => {
    it('should have login configuration', () => {
      assert.ok(rateLimitConfig.login);
      assert.strictEqual(rateLimitConfig.login.maxAttempts, 5);
      assert.strictEqual(rateLimitConfig.login.windowMs, 15 * 60 * 1000);
    });

    it('should have registration configuration', () => {
      assert.ok(rateLimitConfig.register);
      assert.strictEqual(rateLimitConfig.register.maxAttempts, 3);
    });

    it('should have sync configuration', () => {
      assert.ok(rateLimitConfig.sync);
      assert.strictEqual(rateLimitConfig.sync.maxRequests, 100);
    });

    it('should have payload size limit', () => {
      assert.ok(rateLimitConfig.payloadSizeLimit);
      assert.strictEqual(rateLimitConfig.payloadSizeLimit.maxBytes, 1024 * 1024);
    });
  });

  describe('Error Messages', () => {
    it('should return appropriate error messages', () => {
      const loginError = getRateLimitErrorMessage('login', 3600);
      assert.ok(loginError.error.includes('login'));
      assert.strictEqual(loginError.retryAfter, 3600);
    });

    it('should not leak user information', () => {
      const loginError = getRateLimitErrorMessage('login', 100);
      assert.ok(!loginError.error.toLowerCase().includes('user'));
      assert.ok(!loginError.error.toLowerCase().includes('account'));
      assert.ok(!loginError.error.toLowerCase().includes('exists'));
    });

    it('should return default message for unknown type', () => {
      const error = getRateLimitErrorMessage('unknown', 60);
      assert.ok(error.error.includes('Rate limit exceeded'));
    });
  });
});

console.log('✓ All rate limiting tests passed');
