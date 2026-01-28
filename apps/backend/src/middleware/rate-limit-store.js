/**
 * In-Memory Rate Limiter Store
 * 
 * Works in both Cloudflare Workers and Node.js environments.
 * For production with multiple workers, consider using:
 * - Cloudflare Durable Objects
 * - Redis (for Node.js)
 * - Cloudflare KV (for distributed edge)
 */

export class RateLimitStore {
  constructor() {
    // Map structure: identifier -> { attempts: number, firstAttempt: timestamp, blocked: boolean, blockedUntil: timestamp }
    this.store = new Map();
    
    // Cleanup old entries every 5 minutes
    this.cleanupInterval = 5 * 60 * 1000;
    this.startCleanup();
  }

  /**
   * Get rate limit state for an identifier
   */
  get(identifier) {
    const entry = this.store.get(identifier);
    
    if (!entry) {
      return { attempts: 0, firstAttempt: Date.now(), blocked: false, blockedUntil: null };
    }

    // Check if block has expired
    if (entry.blocked && entry.blockedUntil && Date.now() >= entry.blockedUntil) {
      this.store.delete(identifier);
      return { attempts: 0, firstAttempt: Date.now(), blocked: false, blockedUntil: null };
    }

    return entry;
  }

  /**
   * Increment attempt counter
   */
  increment(identifier, windowMs) {
    const entry = this.get(identifier);
    const now = Date.now();

    // Reset if outside window
    if (now - entry.firstAttempt > windowMs) {
      this.store.set(identifier, {
        attempts: 1,
        firstAttempt: now,
        blocked: false,
        blockedUntil: null
      });
      return 1;
    }

    // Increment within window
    entry.attempts++;
    this.store.set(identifier, entry);
    return entry.attempts;
  }

  /**
   * Block an identifier for a duration
   */
  block(identifier, durationMs) {
    const entry = this.get(identifier);
    entry.blocked = true;
    entry.blockedUntil = Date.now() + durationMs;
    this.store.set(identifier, entry);
  }

  /**
   * Check if identifier is currently blocked
   */
  isBlocked(identifier) {
    const entry = this.get(identifier);
    return entry.blocked && (!entry.blockedUntil || Date.now() < entry.blockedUntil);
  }

  /**
   * Get seconds until block expires
   */
  getBlockedSeconds(identifier) {
    const entry = this.get(identifier);
    if (!entry.blocked || !entry.blockedUntil) return 0;
    
    const remaining = Math.ceil((entry.blockedUntil - Date.now()) / 1000);
    return Math.max(0, remaining);
  }

  /**
   * Reset rate limit for identifier
   */
  reset(identifier) {
    this.store.delete(identifier);
  }

  /**
   * Cleanup expired entries
   */
  cleanup() {
    const now = Date.now();
    
    for (const [identifier, entry] of this.store.entries()) {
      // Remove if block expired or entry is very old
      if (
        (entry.blockedUntil && now >= entry.blockedUntil) ||
        (!entry.blocked && now - entry.firstAttempt > 24 * 60 * 60 * 1000) // 24 hours
      ) {
        this.store.delete(identifier);
      }
    }
  }

  /**
   * Start automatic cleanup
   */
  startCleanup() {
    // Don't start interval in Cloudflare Workers (short-lived execution context)
    if (typeof setInterval !== 'undefined' && typeof process !== 'undefined') {
      setInterval(() => this.cleanup(), this.cleanupInterval);
    }
  }
}

// Singleton instance
let storeInstance = null;

export function getRateLimitStore() {
  if (!storeInstance) {
    storeInstance = new RateLimitStore();
  }
  return storeInstance;
}
