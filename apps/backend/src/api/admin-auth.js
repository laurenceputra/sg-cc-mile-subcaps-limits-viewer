import { Hono } from 'hono';
import { generateToken, constantTimeEqual } from '../auth/jwt.js';
import { normalizeEmail, validateFields } from '../middleware/validation.js';
import { logAuditEvent, AuditEventType } from '../audit/logger.js';
import { adminAuthMiddleware } from '../middleware/auth.js';

const ADMIN_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour

async function hashAdminPassword(password, pepper) {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${password}:${pepper}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export default function createAdminAuthRoutes(rateLimiters) {
  const adminAuth = new Hono();

  adminAuth.post(
    '/login',
    validateFields({ email: 'email', password: 'password' }),
    rateLimiters.loginRateLimiter,
    rateLimiters.progressiveDelayMiddleware,
    async (c) => {
      let { email, password } = c.get('validatedBody') || await c.req.json();
      email = normalizeEmail(email);

      const db = c.get('db');
      const configuredHash = c.env?.ADMIN_LOGIN_PASSWORD_HASH || '';
      const pepper = c.env?.ADMIN_LOGIN_PEPPER || '';
      const fallbackHash = c.env?.DUMMY_PASSWORD_HASH || '0'.repeat(64);

      const derivedHash = await hashAdminPassword(password, pepper);
      const compareHash = configuredHash || fallbackHash;

      if (!constantTimeEqual(derivedHash, compareHash)) {
        if (db) {
          await logAuditEvent(db, {
            eventType: AuditEventType.ADMIN_LOGIN_FAILED,
            request: c.req.raw,
            userId: null,
            details: { email }
          });
        }
        return c.json({ error: 'Invalid credentials' }, 401);
      }

      if (!configuredHash || !pepper || !db) {
        console.error('[Admin Auth] Missing admin login secrets');
        return c.json({ error: 'Authentication failed' }, 500);
      }

      let adminUserId = null;
      const existingAdmin = await db.getUserByEmail(email);
      if (existingAdmin?.id) {
        adminUserId = existingAdmin.id;
      } else {
        adminUserId = await db.createUser(email, configuredHash, 'paid');
      }

      const token = await generateToken(
        adminUserId,
        c.env.JWT_SECRET,
        { role: 'admin', ttlSeconds: ADMIN_TOKEN_TTL_SECONDS }
      );

      if (db) {
        await logAuditEvent(db, {
          eventType: AuditEventType.ADMIN_LOGIN_SUCCESS,
          request: c.req.raw,
          userId: null,
          details: { email }
        });
      }

      return c.json({ token, role: 'admin', expiresIn: ADMIN_TOKEN_TTL_SECONDS });
    }
  );

  adminAuth.post(
    '/logout',
    adminAuthMiddleware,
    rateLimiters.adminRateLimiter,
    async (c) => {
      const admin = c.get('admin');
      const db = c.get('db');

      if (db && admin?.jti) {
        await db.blacklistToken(admin.userId, admin.jti, admin.exp, 'logout');
      }

      return c.json({ success: true, message: 'Logged out successfully' });
    }
  );

  return adminAuth;
}
