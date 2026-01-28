import { Hono } from 'hono';
import { generateToken } from '../auth/jwt.js';
import { 
  loginRateLimiter, 
  registerRateLimiter, 
  progressiveDelayMiddleware 
} from '../middleware/rate-limiter.js';
import { validateFields, validateOptionalFields } from '../middleware/validation.js';
import { logAuditEvent, AuditEventType } from '../audit/logger.js';

const auth = new Hono();

auth.post('/register', 
  registerRateLimiter,
  validateFields({ email: 'email', passwordHash: 'passwordHash' }),
  validateOptionalFields({ tier: 'tier' }),
  async (c) => {
  const { email, passwordHash, tier = 'free' } = c.get('validatedBody') || await c.req.json();

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
  loginRateLimiter, 
  progressiveDelayMiddleware(),
  validateFields({ email: 'email', passwordHash: 'passwordHash' }),
  async (c) => {
  const { email, passwordHash } = c.get('validatedBody') || await c.req.json();

  const db = c.get('db');
  
  try {
    const user = await db.getUserByEmail(email);
    if (!user || user.passphrase_hash !== passwordHash) {
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

auth.post('/device/register',
  validateFields({ deviceId: 'deviceId', name: 'deviceName' }),
  async (c) => {
  const user = c.get('user');
  const { deviceId, name } = c.get('validatedBody') || await c.req.json();

  const db = c.get('db');
  
  try {
    await db.registerDevice(user.userId, deviceId, name);
    
    // Audit log device registration
    await logAuditEvent(db, {
      eventType: AuditEventType.DEVICE_REGISTER,
      request: c.req.raw,
      userId: user.userId,
      deviceId,
      details: { deviceName: name }
    });
    
    return c.json({ success: true });
  } catch (error) {
    console.error('[Auth] Device registration error:', error);
    return c.json({ error: 'Device registration failed' }, 500);
  }
});

export default auth;
