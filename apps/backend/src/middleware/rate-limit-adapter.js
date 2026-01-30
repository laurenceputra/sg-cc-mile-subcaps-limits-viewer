import { rateLimitConfig, calculateProgressiveDelay, getRateLimitErrorMessage } from './rate-limit-config.js';
import { getClientIdentifier } from './rate-limit-identity.js';

function setRateLimitHeaders(c, limit, remaining, retryAfterSeconds) {
  c.header('X-RateLimit-Limit', String(limit));
  if (typeof remaining === 'number') {
    c.header('X-RateLimit-Remaining', String(Math.max(0, remaining)));
  }
  if (retryAfterSeconds > 0) {
    c.header('Retry-After', String(retryAfterSeconds));
    c.header('X-RateLimit-Reset', String(Math.floor(Date.now() / 1000) + retryAfterSeconds));
  }
}

export function createRateLimiterAdapter(adapter) {
  const createRateLimiter = (limitType, config) => async (c, next) => {
    const identifier = await getClientIdentifier(c);
    const limit = config.maxAttempts || config.maxRequests;
    const result = await adapter.consume(limitType, config, identifier, c);
    const retryAfter = result.retryAfter || 0;

    setRateLimitHeaders(c, limit, result.remaining, retryAfter);

    if (!result.allowed) {
      return c.json(getRateLimitErrorMessage(limitType, retryAfter), 429);
    }

    await next();
  };

  return {
    createRateLimiter,
    createProgressiveDelayMiddleware() {
      return async (c, next) => {
        if (!adapter.supportsProgressiveDelay) {
          await next();
          return;
        }

        const identifier = await getClientIdentifier(c);
        const consumedPoints = await adapter.getConsumedPoints('login', rateLimitConfig.login, identifier);

        if (consumedPoints > 0) {
          const delayMs = calculateProgressiveDelay(
            consumedPoints,
            rateLimitConfig.login.progressiveDelay
          );

          if (delayMs > 0) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
        }

        await next();
      };
    }
  };
}
