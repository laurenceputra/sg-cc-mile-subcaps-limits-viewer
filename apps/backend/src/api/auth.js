import { Hono } from 'hono';
import { generateToken } from '../auth/jwt.js';
import { 
  loginRateLimiter, 
  registerRateLimiter, 
  progressiveDelayMiddleware 
} from '../middleware/rate-limiter.js';

const auth = new Hono();

auth.post('/register', registerRateLimiter, async (c) => {
  const { email, passwordHash, tier = 'free' } = await c.req.json();
  
  if (!email || !passwordHash) {
    return c.json({ error: 'Email and passwordHash required' }, 400);
  }

  const db = c.get('db');
  
  try {
    const existingUser = await db.getUserByEmail(email);
    if (existingUser) {
      // Generic error to prevent user enumeration
      return c.json({ error: 'Registration failed' }, 400);
    }

    const userId = await db.createUser(email, passwordHash, tier);
    const token = await generateToken(userId, c.env.JWT_SECRET || 'dev-secret');

    return c.json({ token, userId, tier });
  } catch (error) {
    console.error('[Auth] Registration error:', error);
    return c.json({ error: 'Registration failed' }, 500);
  }
});

auth.post('/login', loginRateLimiter, progressiveDelayMiddleware(), async (c) => {
  const { email, passwordHash } = await c.req.json();
  
  if (!email || !passwordHash) {
    return c.json({ error: 'Email and passwordHash required' }, 400);
  }

  const db = c.get('db');
  
  try {
    const user = await db.getUserByEmail(email);
    if (!user || user.passphrase_hash !== passwordHash) {
      // Generic error message - don't reveal if user exists
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    const token = await generateToken(user.id, c.env.JWT_SECRET || 'dev-secret');

    return c.json({ token, userId: user.id, tier: user.tier });
  } catch (error) {
    console.error('[Auth] Login error:', error);
    // Generic error - don't leak information
    return c.json({ error: 'Authentication failed' }, 500);
  }
});

auth.post('/device/register', async (c) => {
  const user = c.get('user');
  const { deviceId, name } = await c.req.json();
  
  if (!deviceId || !name) {
    return c.json({ error: 'deviceId and name required' }, 400);
  }

  const db = c.get('db');
  
  try {
    await db.registerDevice(user.userId, deviceId, name);
    return c.json({ success: true });
  } catch (error) {
    console.error('[Auth] Device registration error:', error);
    return c.json({ error: 'Device registration failed' }, 500);
  }
});

export default auth;
