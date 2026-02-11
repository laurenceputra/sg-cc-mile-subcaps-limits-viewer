import { createRateLimiterAdapter } from './rate-limit-adapter.js';

const adapter = {
  supportsProgressiveDelay: false,
  async consume(limitType, config, key, c) {
    const bindingName = `RATE_LIMIT_${limitType.toUpperCase()}`;
    const limiter = c.env?.[bindingName];

    if (!limiter || typeof limiter.limit !== 'function') {
      return { allowed: true, remaining: null, retryAfter: 0 };
    }

    const result = await limiter.limit({ key });
    const limit = config.maxAttempts || config.maxRequests;
    const remaining = typeof result?.remaining === 'number' ? result.remaining : null;

    if (!result?.success) {
      return {
        allowed: false,
        remaining: remaining ?? 0,
        retryAfter: Math.ceil(config.windowMs / 1000)
      };
    }

    return { allowed: true, remaining: remaining ?? limit - 1, retryAfter: 0 };
  },
  async getConsumedPoints() {
    return 0;
  }
};

const adapterApi = createRateLimiterAdapter(adapter);

export const createRateLimiter = adapterApi.createRateLimiter;
export const progressiveDelayMiddleware = adapterApi.createProgressiveDelayMiddleware();
