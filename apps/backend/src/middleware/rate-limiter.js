import {
  createRateLimiter,
  progressiveDelayMiddleware
} from './rate-limiter-worker.js';
import { rateLimitConfig } from './rate-limit-config.js';
export { payloadSizeLimitMiddleware } from './payload-size.js';

export { progressiveDelayMiddleware };

export const loginRateLimiter = createRateLimiter('login', rateLimitConfig.login);
export const registerRateLimiter = createRateLimiter('register', rateLimitConfig.register);
export const syncRateLimiter = createRateLimiter('sync', rateLimitConfig.sync);
export const logoutRateLimiter = createRateLimiter('logout', rateLimitConfig.logout);
export const refreshRateLimiter = createRateLimiter('refresh', rateLimitConfig.refresh);
