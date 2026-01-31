/**
 * Rate Limiting Configuration
 * 
 * Security hardened settings to prevent:
 * - Brute force attacks on login endpoints
 * - DoS via unlimited API calls
 * - Resource exhaustion
 */

export const rateLimitConfig = {
  // Login endpoints - strict limits to prevent credential stuffing
  login: {
    maxAttempts: 5,
    windowMs: 60 * 1000, // per minute per location in Workers
    nodeWindowMs: 15 * 60 * 1000, // 15 minutes in Node
    blockDurationMs: 60 * 60 * 1000, // 1 hour block after max attempts
    progressiveDelay: {
      baseMs: 200,
      maxMs: 5000,
      exponentialFactor: 2
    }
  },

  // Registration - prevent account enumeration and spam
  register: {
    maxAttempts: 3,
    windowMs: 60 * 1000, // per minute per location in Workers
    nodeWindowMs: 60 * 60 * 1000, // 1 hour in Node
    blockDurationMs: 24 * 60 * 60 * 1000 // 24 hour block
  },

  // Sync endpoints - reasonable limits for legitimate use
  sync: {
    maxRequests: 100,
    windowMs: 60 * 1000, // per minute per location in Workers
    nodeWindowMs: 60 * 60 * 1000, // per hour per user in Node
  },

  // Shared mappings - higher frequency for active browsing
  sharedMappings: {
    maxRequests: 20,
    windowMs: 60 * 1000, // per minute per location in Workers
    nodeWindowMs: 60 * 1000, // per minute per user in Node
  },

  // Logout and device management - prevent abuse
  logout: {
    maxRequests: 10,
    windowMs: 60 * 1000, // per minute per location in Workers
    nodeWindowMs: 60 * 1000, // per minute per user in Node
  },

  // Admin endpoints - very strict
  admin: {
    maxRequests: 10,
    windowMs: 60 * 1000, // per minute per location in Workers
    nodeWindowMs: 60 * 1000, // per minute in Node
  },

  // Global payload size limit
  payloadSizeLimit: {
    maxBytes: 1024 * 1024, // 1MB
    errorMessage: 'Request payload too large'
  }
};

/**
 * Calculate progressive delay for failed attempts
 */
export function calculateProgressiveDelay(attemptCount, config) {
  if (attemptCount <= 1) return 0;
  
  const { baseMs, maxMs, exponentialFactor } = config;
  const delay = baseMs * Math.pow(exponentialFactor, attemptCount - 1);
  
  return Math.min(delay, maxMs);
}

/**
 * Get user-friendly error messages that don't leak information
 */
export function getRateLimitErrorMessage(limitType, retryAfterSeconds) {
  const messages = {
    login: 'Too many login attempts. Please try again later.',
    register: 'Too many registration attempts. Please try again later.',
    sync: 'Rate limit exceeded. Please wait before syncing again.',
    logout: 'Rate limit exceeded. Please wait before logging out again.',
    sharedMappings: 'Rate limit exceeded. Please wait before accessing mappings.',
    admin: 'Admin rate limit exceeded. Please wait before retrying.',
    default: 'Rate limit exceeded. Please try again later.'
  };

  const message = messages[limitType] || messages.default;
  
  return {
    error: message,
    retryAfter: retryAfterSeconds
  };
}
