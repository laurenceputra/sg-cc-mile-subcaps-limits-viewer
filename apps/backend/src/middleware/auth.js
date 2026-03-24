import { verifyToken } from '../auth/jwt.js';

export async function authMiddleware(c, next) {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.substring(7);
  
  try {
    const payload = await verifyToken(token, c.env.JWT_SECRET);
    
    // Check if token is blacklisted
    const db = c.get('db');
    if (db && payload.jti) {
      const isBlacklisted = await db.isTokenBlacklisted(payload.jti);
      if (isBlacklisted) {
        return c.json({ error: 'Token has been revoked' }, 401);
      }
      
      // Check if token was issued before user's last "logout all" action
      const userBlacklistTimestamp = await db.getUserBlacklistTimestamp(payload.userId);
      if (userBlacklistTimestamp > payload.iat) {
        return c.json({ error: 'Token has been revoked' }, 401);
      }
    }
    
    c.set('user', payload);
    await next();
  } catch (error) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
}
