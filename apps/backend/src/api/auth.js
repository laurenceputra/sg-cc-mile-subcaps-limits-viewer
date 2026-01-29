import { Hono } from 'hono';
import { generateToken, constantTimeEqual } from '../auth/jwt.js';
import { 
  loginRateLimiter, 
  registerRateLimiter, 
  progressiveDelayMiddleware 
} from '../middleware/rate-limiter.js';
import { validateFields, validateOptionalFields, normalizeEmail, validateInput } from '../middleware/validation.js';
import { logAuditEvent, AuditEventType } from '../audit/logger.js';

const auth = new Hono();

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

auth.post('/register', 
  validateFields({ email: 'email', passwordHash: 'passwordHash' }),
  validateOptionalFields({ tier: 'tier' }),
  registerRateLimiter,
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
    const token = await generateToken(userId, c.env.JWT_SECRET);

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
  loginRateLimiter, 
  progressiveDelayMiddleware(),
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

    const token = await generateToken(user.id, c.env.JWT_SECRET);

    // Audit log successful login
    await logAuditEvent(db, {
      eventType: AuditEventType.LOGIN_SUCCESS,
      request: c.req.raw,
      userId: user.id,
      details: { email }
    });

    return c.json({ token, userId: user.id, tier: user.tier });
  } catch (error) {
    console.error('[Auth] Login error:', error);
    // Generic error - don't leak information
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
    
    // Audit log logout all
    await logAuditEvent(db, {
      eventType: AuditEventType.LOGOUT_ALL,
      request: c.req.raw,
      userId: user.userId,
      details: {}
    });
    
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
    // Check device count limit
    const deviceCount = await db.getDeviceCount(user.userId);
    const userData = await db.getUserById(user.userId);
    const limit = DEVICE_LIMITS[userData.tier] || DEVICE_LIMITS.free;
    
    // Check if device already exists
    const existingDevices = await db.getDevicesByUser(user.userId);
    const deviceExists = existingDevices.some(d => d.device_id === deviceId);
    
    if (!deviceExists && deviceCount >= limit) {
      return c.json({ 
        error: 'Device limit reached',
        message: `Maximum ${limit} devices allowed for ${userData.tier} tier`,
        limit,
        current: deviceCount
      }, 400);
    }
    
    await db.registerDevice(user.userId, deviceId, name);
    
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

export default auth;
