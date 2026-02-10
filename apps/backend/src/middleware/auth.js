import { verifyToken } from '../auth/jwt.js';
import { logAuditEvent, AuditEventType } from '../audit/logger.js';

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

async function logAdminTokenRejected(c, reason) {
  const db = c.get('db');
  if (!db) return;
  await logAuditEvent(db, {
    eventType: AuditEventType.ADMIN_TOKEN_REJECTED,
    request: c.req.raw,
    userId: null,
    details: { reason }
  });
}

export async function adminAuthMiddleware(c, next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    await logAdminTokenRejected(c, 'missing_token');
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.substring(7);

  try {
    const payload = await verifyToken(token, c.env.JWT_SECRET);

    if (payload.role !== 'admin') {
      await logAdminTokenRejected(c, 'missing_admin_role');
      return c.json({ error: 'Forbidden' }, 403);
    }

    const db = c.get('db');
    if (db && payload.jti) {
      const isBlacklisted = await db.isTokenBlacklisted(payload.jti);
      if (isBlacklisted) {
        await logAdminTokenRejected(c, 'token_revoked');
        return c.json({ error: 'Token has been revoked' }, 401);
      }
    }

    c.set('admin', payload);
    c.set('user', payload);
    await next();
  } catch (error) {
    await logAdminTokenRejected(c, 'invalid_or_expired');
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
}
