import { rateLimitConfig } from './rate-limit-config.js';
import {
  createRateLimiter,
  progressiveDelayMiddleware
} from './rate-limiter-worker.js';

export function payloadSizeLimitMiddleware() {
  return async (c, next) => {
    const contentLength = c.req.header('Content-Length');

    if (contentLength) {
      const size = parseInt(contentLength, 10);

      if (size > rateLimitConfig.payloadSizeLimit.maxBytes) {
        return c.json({
          error: rateLimitConfig.payloadSizeLimit.errorMessage,
          maxSize: `${rateLimitConfig.payloadSizeLimit.maxBytes / 1024 / 1024}MB`
        }, 413);
      }
    }

    await next();
  };
}

export { progressiveDelayMiddleware };

export const loginRateLimiter = createRateLimiter('login', rateLimitConfig.login);
export const registerRateLimiter = createRateLimiter('register', rateLimitConfig.register);
export const syncRateLimiter = createRateLimiter('sync', rateLimitConfig.sync);
export const sharedMappingsRateLimiter = createRateLimiter('sharedMappings', rateLimitConfig.sharedMappings);
export const logoutRateLimiter = createRateLimiter('logout', rateLimitConfig.logout);
export const adminRateLimiter = createRateLimiter('admin', rateLimitConfig.admin);
