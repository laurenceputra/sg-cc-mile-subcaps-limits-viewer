import { RateLimiterMemory, RateLimiterRedis } from 'rate-limiter-flexible';
import Redis from 'ioredis';
import { createRateLimiterAdapter } from './rate-limit-adapter.js';

const limiterCache = new Map();
let redisClient = null;

function isRedisEnabled() {
  const url = process?.env?.REDIS_URL;
  return typeof url === 'string' && url.trim().length > 0;
}

function getRedisClient() {
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true
    });
  }
  return redisClient;
}

function toLimiterOptions(limitType, config) {
  const points = config.maxAttempts || config.maxRequests;
  const durationSec = Math.ceil((config.nodeWindowMs || config.windowMs) / 1000);
  const blockDurationSec = config.blockDurationMs ? Math.ceil(config.blockDurationMs / 1000) : 0;

  return {
    keyPrefix: `bankcc:${limitType}`,
    points,
    duration: durationSec,
    blockDuration: blockDurationSec
  };
}

function getNodeLimiter(limitType, config) {
  const key = `${limitType}:${config.nodeWindowMs || config.windowMs}`;
  if (limiterCache.has(key)) {
    return limiterCache.get(key);
  }

  const options = toLimiterOptions(limitType, config);
  let limiter;

  if (isRedisEnabled()) {
    limiter = new RateLimiterRedis({
      ...options,
      storeClient: getRedisClient()
    });
  } else {
    limiter = new RateLimiterMemory(options);
  }

  limiterCache.set(key, limiter);
  return limiter;
}

const adapter = {
  supportsProgressiveDelay: true,
  async consume(limitType, config, key) {
    const limiter = getNodeLimiter(limitType, config);
    try {
      const res = await limiter.consume(key, 1);
      return {
        allowed: true,
        remaining: res.remainingPoints,
        retryAfter: Math.max(0, Math.ceil(res.msBeforeNext / 1000))
      };
    } catch (res) {
      return {
        allowed: false,
        remaining: res.remainingPoints ?? 0,
        retryAfter: Math.max(0, Math.ceil(res.msBeforeNext / 1000))
      };
    }
  },
  async getConsumedPoints(limitType, config, key) {
    const limiter = getNodeLimiter(limitType, config);
    const entry = await limiter.get(key);
    return entry?.consumedPoints ?? 0;
  }
};

const adapterApi = createRateLimiterAdapter(adapter);

export const createRateLimiter = adapterApi.createRateLimiter;
export const progressiveDelayMiddleware = adapterApi.createProgressiveDelayMiddleware();

export function resetNodeLimiters() {
  limiterCache.clear();
}

export async function resetRateLimit(limitType, identifier) {
  const limiter = getNodeLimiter(limitType, {});
  await limiter.delete(identifier);
}
