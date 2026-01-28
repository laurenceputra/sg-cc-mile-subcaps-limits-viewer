/**
 * Rate Limiting Middleware for Hono.js
 * 
 * Compatible with both Cloudflare Workers and Node.js.
 * Provides comprehensive protection against:
 * - Brute force attacks
 * - DoS/DDoS attempts
 * - Resource exhaustion
 */

import { getRateLimitStore } from './rate-limit-store.js';
import { rateLimitConfig, calculateProgressiveDelay, getRateLimitErrorMessage } from './rate-limit-config.js';

/**
 * Extract client identifier from request
 * Uses IP address if available, falls back to user ID for authenticated requests
 */
function getClientIdentifier(c) {
  // Try to get IP from various headers (Cloudflare, standard proxies)
  const cfConnectingIP = c.req.header('CF-Connecting-IP');
  const xForwardedFor = c.req.header('X-Forwarded-For');
  const xRealIP = c.req.header('X-Real-IP');
  
  const ip = cfConnectingIP || 
             (xForwardedFor && xForwardedFor.split(',')[0].trim()) || 
             xRealIP || 
             'unknown';

  // For authenticated requests, also use user ID
  const user = c.get('user');
  if (user && user.userId) {
    return `user:${user.userId}:${ip}`;
  }

  return `ip:${ip}`;
}

/**
 * Generic rate limiter middleware factory
 */
export function createRateLimiter(limitType, config) {
  const store = getRateLimitStore();

  return async (c, next) => {
    const identifier = `${limitType}:${getClientIdentifier(c)}`;
    
    // Check if blocked
    if (store.isBlocked(identifier)) {
      const retryAfter = store.getBlockedSeconds(identifier);
      const errorResponse = getRateLimitErrorMessage(limitType, retryAfter);
      
      c.header('Retry-After', String(retryAfter));
      c.header('X-RateLimit-Limit', String(config.maxAttempts || config.maxRequests));
      c.header('X-RateLimit-Remaining', '0');
      c.header('X-RateLimit-Reset', String(Math.floor(Date.now() / 1000) + retryAfter));
      
      return c.json(errorResponse, 429);
    }

    // Increment and check limit
    const attempts = store.increment(identifier, config.windowMs);
    const limit = config.maxAttempts || config.maxRequests;
    const remaining = Math.max(0, limit - attempts);

    // Set rate limit headers
    c.header('X-RateLimit-Limit', String(limit));
    c.header('X-RateLimit-Remaining', String(remaining));
    c.header('X-RateLimit-Reset', String(Math.floor((Date.now() + config.windowMs) / 1000)));

    // Check if limit exceeded
    if (attempts > limit) {
      const blockDuration = config.blockDurationMs || config.windowMs;
      store.block(identifier, blockDuration);
      
      const retryAfter = Math.ceil(blockDuration / 1000);
      const errorResponse = getRateLimitErrorMessage(limitType, retryAfter);
      
      c.header('Retry-After', String(retryAfter));
      
      return c.json(errorResponse, 429);
    }

    await next();
  };
}

/**
 * Progressive delay middleware for failed login attempts
 * Adds exponential backoff to slow down brute force attacks
 */
export function progressiveDelayMiddleware() {
  const store = getRateLimitStore();

  return async (c, next) => {
    const identifier = getClientIdentifier(c);
    const entry = store.get(`login:${identifier}`);
    
    // Calculate delay based on previous attempts
    if (entry.attempts > 0) {
      const delayMs = calculateProgressiveDelay(
        entry.attempts,
        rateLimitConfig.login.progressiveDelay
      );
      
      if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    await next();
  };
}

/**
 * Payload size limit middleware
 * Prevents DoS via large payloads
 */
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

/**
 * Pre-configured rate limiters for different endpoint types
 */
export const loginRateLimiter = createRateLimiter('login', rateLimitConfig.login);
export const registerRateLimiter = createRateLimiter('register', rateLimitConfig.register);
export const syncRateLimiter = createRateLimiter('sync', rateLimitConfig.sync);
export const sharedMappingsRateLimiter = createRateLimiter('sharedMappings', rateLimitConfig.sharedMappings);
export const logoutRateLimiter = createRateLimiter('logout', rateLimitConfig.logout);
export const adminRateLimiter = createRateLimiter('admin', rateLimitConfig.admin);

/**
 * Reset rate limit for a specific identifier (useful for testing or admin actions)
 */
export function resetRateLimit(limitType, identifier) {
  const store = getRateLimitStore();
  store.reset(`${limitType}:${identifier}`);
}
