import { Hono } from 'hono';
import { generateToken, constantTimeEqual } from '../auth/jwt.js';
import { validateFields, validateOptionalFields, normalizeEmail, validateInput } from '../middleware/validation.js';
import { logAuditEvent, AuditEventType } from '../audit/logger.js';

const auth = new Hono();

const ACCESS_TOKEN_TTL_SECONDS_DEFAULT = 60 * 60;
const ACCESS_TOKEN_TTL_SECONDS_MIN = 15 * 60;
const ACCESS_TOKEN_TTL_SECONDS_MAX = 24 * 60 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const REFRESH_COOKIE_NAME = 'ccSubcapRefreshToken';
const REFRESH_COOKIE_PATH = '/auth';

// Device limits by tier
const DEVICE_LIMITS = {
  free: 5,
  paid: 10
};

// Mock email notification function
async function sendDeviceRegistrationEmail(email, deviceName) {
  console.log(`[Email] Would send device registration notification to ${email} for device: ${deviceName}`);
  // In production, integrate with email service (SendGrid, AWS SES, etc.)
  return Promise.resolve();
}

function getAccessTokenTtlSeconds(env) {
  const rawValue = Number(env?.ACCESS_TOKEN_TTL_SECONDS);
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return ACCESS_TOKEN_TTL_SECONDS_DEFAULT;
  }
  return Math.min(Math.max(rawValue, ACCESS_TOKEN_TTL_SECONDS_MIN), ACCESS_TOKEN_TTL_SECONDS_MAX);
}

function isProductionEnv(env) {
  return env?.ENVIRONMENT === 'production' || env?.NODE_ENV === 'production';
}

function parseCookies(header) {
  if (!header) return {};
  return header.split(';').reduce((acc, part) => {
    const [key, ...rest] = part.trim().split('=');
    if (!key) return acc;
    acc[key] = rest.join('=');
    return acc;
  }, {});
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function generateOpaqueToken(size = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return base64UrlEncode(bytes);
}

async function hashRefreshToken(token) {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function buildRefreshCookie(token, env) {
  const parts = [
    `${REFRESH_COOKIE_NAME}=${token}`,
    `Max-Age=${REFRESH_TOKEN_TTL_SECONDS}`,
    `Path=${REFRESH_COOKIE_PATH}`,
    'HttpOnly',
    'SameSite=Strict'
  ];
  if (isProductionEnv(env)) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

function clearRefreshCookie(env) {
  const parts = [
    `${REFRESH_COOKIE_NAME}=`,
    'Max-Age=0',
    `Path=${REFRESH_COOKIE_PATH}`,
    'HttpOnly',
    'SameSite=Strict'
  ];
  if (isProductionEnv(env)) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

function getRefreshTokenFromRequest(c) {
  const cookies = parseCookies(c.req.header('Cookie'));
  return cookies[REFRESH_COOKIE_NAME] || null;
}

export default function createAuthRoutes(rateLimiters) {
  auth.post('/register', 
    validateFields({ email: 'email', passwordHash: 'passwordHash' }),
    validateOptionalFields({ tier: 'tier' }),
    rateLimiters.registerRateLimiter,
    async (c) => {
    let { email, passwordHash, tier = 'free' } = c.get('validatedBody') || await c.req.json();
    
    // Normalize email
    email = normalizeEmail(email);

    const db = c.get('db');
    
    try {
      const existingUser = await db.getUserByEmail(email);
      if (existingUser) {
        // Generic error to prevent user enumeration
        return c.json({ error: 'Registration failed' }, 400);
      }

      const userId = await db.createUser(email, passwordHash, tier);
      const token = await generateToken(userId, c.env.JWT_SECRET, {
        ttlSeconds: getAccessTokenTtlSeconds(c.env)
      });

      // Audit log successful registration
      await logAuditEvent(db, {
        eventType: AuditEventType.REGISTER_SUCCESS,
        request: c.req.raw,
        userId,
        details: { email, tier }
      });

      return c.json({ token, userId, tier });
    } catch (error) {
      console.error('[Auth] Registration error:', error);
      return c.json({ error: 'Registration failed' }, 500);
    }
  });

  auth.post('/login', 
    validateFields({ email: 'email', passwordHash: 'passwordHash' }),
    rateLimiters.loginRateLimiter, 
    rateLimiters.progressiveDelayMiddleware,
    async (c) => {
    let { email, passwordHash } = c.get('validatedBody') || await c.req.json();
    
    // Normalize email
    email = normalizeEmail(email);

    const db = c.get('db');
    const fallbackHash = c.env?.DUMMY_PASSWORD_HASH || '0'.repeat(64);
    
    try {
      if (!db) {
        return c.json({ error: 'Authentication failed' }, 500);
      }
      const user = await db.getUserByEmail(email);
      // SECURITY: Use constant-time comparison for password hash to prevent timing attacks
      // that could allow attackers to determine if user exists or guess password hashes
      if (!constantTimeEqual(user?.passphrase_hash || fallbackHash, passwordHash)) {
        // Audit log failed login attempt
        await logAuditEvent(db, {
          eventType: AuditEventType.LOGIN_FAILED,
          request: c.req.raw,
          userId: user?.id || null,
          details: { email }
        });
        
        // Generic error message - don't reveal if user exists
        return c.json({ error: 'Invalid credentials' }, 401);
      }

      const accessToken = await generateToken(user.id, c.env.JWT_SECRET, {
        ttlSeconds: getAccessTokenTtlSeconds(c.env)
      });
      const refreshToken = generateOpaqueToken();
      const refreshTokenHash = await hashRefreshToken(refreshToken);
      const familyId = generateOpaqueToken(16);
      const expiresAt = Math.floor(Date.now() / 1000) + REFRESH_TOKEN_TTL_SECONDS;
      await db.createRefreshToken(user.id, refreshTokenHash, familyId, expiresAt);

      // Audit log successful login
      await logAuditEvent(db, {
        eventType: AuditEventType.LOGIN_SUCCESS,
        request: c.req.raw,
        userId: user.id,
        details: { email }
      });

      c.header('Set-Cookie', buildRefreshCookie(refreshToken, c.env));
      return c.json({ token: accessToken, userId: user.id, tier: user.tier });
    } catch (error) {
      console.error('[Auth] Login error:', error);
      // Generic error - don't leak information
      return c.json({ error: 'Authentication failed' }, 500);
    }
  });

  auth.post('/refresh', rateLimiters.refreshRateLimiter, async (c) => {
    const db = c.get('db');
    if (!db) {
      return c.json({ error: 'Authentication failed' }, 500);
    }

    const refreshToken = getRefreshTokenFromRequest(c);
    if (!refreshToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    try {
      const refreshTokenHash = await hashRefreshToken(refreshToken);
      const tokenRecord = await db.getRefreshTokenByHash(refreshTokenHash);
      if (!tokenRecord) {
        return c.json({ error: 'Unauthorized' }, 401);
      }

      const now = Math.floor(Date.now() / 1000);
      if (tokenRecord.revoked_at) {
        await logAuditEvent(db, {
          eventType: AuditEventType.REFRESH_TOKEN_REUSE,
          request: c.req.raw,
          userId: tokenRecord.user_id,
          details: { familyId: tokenRecord.family_id, reason: 'revoked' }
        });
        await db.revokeRefreshTokenFamily(tokenRecord.family_id, 'reuse_detected');
        return c.json({ error: 'Unauthorized' }, 401);
      }
      if (tokenRecord.replaced_by) {
        await logAuditEvent(db, {
          eventType: AuditEventType.REFRESH_TOKEN_REUSE,
          request: c.req.raw,
          userId: tokenRecord.user_id,
          details: { familyId: tokenRecord.family_id, reason: 'rotated' }
        });
        await db.revokeRefreshTokenFamily(tokenRecord.family_id, 'reuse_detected');
        return c.json({ error: 'Unauthorized' }, 401);
      }
      if (tokenRecord.expires_at < now) {
        await db.revokeRefreshTokenFamily(tokenRecord.family_id, 'expired');
        return c.json({ error: 'Unauthorized' }, 401);
      }

      const newRefreshToken = generateOpaqueToken();
      const newRefreshTokenHash = await hashRefreshToken(newRefreshToken);
      const expiresAt = now + REFRESH_TOKEN_TTL_SECONDS;
      await db.createRefreshToken(tokenRecord.user_id, newRefreshTokenHash, tokenRecord.family_id, expiresAt, tokenRecord.id);
      const rotated = await db.markRefreshTokenRotated(tokenRecord.id, newRefreshTokenHash);
      if (rotated === 0) {
        await logAuditEvent(db, {
          eventType: AuditEventType.REFRESH_TOKEN_REUSE,
          request: c.req.raw,
          userId: tokenRecord.user_id,
          details: { familyId: tokenRecord.family_id, reason: 'race' }
        });
        await db.revokeRefreshTokenFamily(tokenRecord.family_id, 'reuse_detected');
        return c.json({ error: 'Unauthorized' }, 401);
      }

      const accessToken = await generateToken(tokenRecord.user_id, c.env.JWT_SECRET, {
        ttlSeconds: getAccessTokenTtlSeconds(c.env)
      });

      c.header('Set-Cookie', buildRefreshCookie(newRefreshToken, c.env));
      return c.json({ token: accessToken });
    } catch (error) {
      console.error('[Auth] Refresh error:', error);
      return c.json({ error: 'Authentication failed' }, 500);
    }
  });

  auth.post('/logout', async (c) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    const db = c.get('db');
    
    try {
      const refreshToken = getRefreshTokenFromRequest(c);
      if (refreshToken && db) {
        const refreshTokenHash = await hashRefreshToken(refreshToken);
        const tokenRecord = await db.getRefreshTokenByHash(refreshTokenHash);
        if (tokenRecord) {
          await db.revokeRefreshTokenFamily(tokenRecord.family_id, 'logout');
        }
      }
      if (user.jti) {
        await db.blacklistToken(user.userId, user.jti, user.exp, 'logout');
      }
      
      // Audit log logout
      await logAuditEvent(db, {
        eventType: AuditEventType.LOGOUT,
        request: c.req.raw,
        userId: user.userId,
        details: {}
      });
      
      c.header('Set-Cookie', clearRefreshCookie(c.env));
      return c.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      console.error('[Auth] Logout error:', error);
      return c.json({ error: 'Logout failed' }, 500);
    }
  });

  auth.post('/logout-all', async (c) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    const db = c.get('db');
    
    try {
      await db.blacklistAllUserTokens(user.userId, 'logout_all');
      await db.revokeAllRefreshTokens(user.userId, 'logout_all');
      
      // Audit log logout all
      await logAuditEvent(db, {
        eventType: AuditEventType.LOGOUT_ALL,
        request: c.req.raw,
        userId: user.userId,
        details: {}
      });
      
      c.header('Set-Cookie', clearRefreshCookie(c.env));
      return c.json({ success: true, message: 'All devices logged out successfully' });
    } catch (error) {
      console.error('[Auth] Logout all error:', error);
      return c.json({ error: 'Logout all failed' }, 500);
    }
  });

  auth.post('/device/register', async (c) => {
    const user = c.get('user');
    const body = c.get('validatedBody') || await c.req.json();
    const deviceId = body.deviceId || body.deviceFingerprint;
    const name = body.name || body.deviceName;

    const db = c.get('db');
    
    try {
      if (!deviceId || !name) {
        return c.json({ error: 'Device ID and name are required' }, 400);
      }

      const deviceIdError = validateInput(deviceId, 'deviceId');
      if (deviceIdError) {
        return c.json({ error: deviceIdError }, 400);
      }
      const deviceNameError = validateInput(name, 'deviceName');
      if (deviceNameError) {
        return c.json({ error: deviceNameError }, 400);
      }
      const userData = await db.getUserById(user.userId);
      const limit = DEVICE_LIMITS[userData.tier] || DEVICE_LIMITS.free;
      const registration = await db.registerDeviceWithLimit(user.userId, deviceId, name, limit);

      if (!registration.ok) {
        return c.json({ 
          error: 'Device limit reached',
          message: `Maximum ${limit} devices allowed for ${userData.tier} tier`,
          limit,
          current: registration.count
        }, 400);
      }
      
      // Send email notification (mock)
      await sendDeviceRegistrationEmail(userData.email, name);
      
      // Audit log device registration
      await logAuditEvent(db, {
        eventType: AuditEventType.DEVICE_REGISTER,
        request: c.req.raw,
        userId: user.userId,
        deviceId,
        details: { deviceName: name }
      });
      
      return c.json({ success: true, deviceId });
    } catch (error) {
      console.error('[Auth] Device registration error:', error);
      return c.json({ error: 'Device registration failed' }, 500);
    }
  });

  auth.delete('/device/:deviceId', async (c) => {
    const user = c.get('user');
    const deviceId = c.req.param('deviceId');
    const db = c.get('db');
    
    try {
      await db.deleteDevice(deviceId, user.userId);
      
      // Audit log device removal
      await logAuditEvent(db, {
        eventType: AuditEventType.DEVICE_REMOVE,
        request: c.req.raw,
        userId: user.userId,
        deviceId,
        details: {}
      });
      
      return c.json({ success: true, message: 'Device removed successfully' });
    } catch (error) {
      console.error('[Auth] Device removal error:', error);
      return c.json({ error: 'Device removal failed' }, 500);
    }
  });

  auth.get('/devices', async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    
    try {
      const devices = await db.getDevicesByUser(user.userId);
      const userData = await db.getUserById(user.userId);
      const limit = DEVICE_LIMITS[userData.tier] || DEVICE_LIMITS.free;
      
      return c.json({ 
        devices,
        limit,
        count: devices.length
      });
    } catch (error) {
      console.error('[Auth] Get devices error:', error);
      return c.json({ error: 'Failed to fetch devices' }, 500);
    }
  });

  return auth;
}
