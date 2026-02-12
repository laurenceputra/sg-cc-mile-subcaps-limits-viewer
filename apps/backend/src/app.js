import { Hono } from 'hono';
import { authMiddleware } from './middleware/auth.js';
import { configureCors, csrfProtection } from './middleware/csrf.js';
import { validateJsonMiddleware } from './middleware/validation.js';
import { securityHeadersMiddleware } from './middleware/security-headers.js';
import { errorHandler } from './middleware/error-handler.js';
import createAuthRoutes from './api/auth.js';
import createAdminAuthRoutes from './api/admin-auth.js';
import sync from './api/sync.js';
import sharedMappings from './api/shared-mappings.js';
import admin from './api/admin.js';
import user from './api/user.js';
import web from './api/web.js';

export function createApp(rateLimiters) {
  const app = new Hono();

  // Parse allowed origins from environment
  const getAllowedOrigins = (env, requestUrl) => {
    const origins = env?.ALLOWED_ORIGINS || 'https://pib.uob.com.sg,https://cib.maybank2u.com.sg';
    const parsedOrigins = origins.split(',').map(o => o.trim()).filter(Boolean);
    const allowedOrigins = new Set(parsedOrigins);
    if (requestUrl) {
      try {
        const origin = new URL(requestUrl).origin;
        if (origin) {
          allowedOrigins.add(origin);
        }
      } catch {
        // Ignore invalid URL parsing for non-standard requests
      }
    }
    return Array.from(allowedOrigins);
  };

  // Set database in context from environment
  app.use('/*', async (c, next) => {
    if (c.env.db) {
      c.set('db', c.env.db);
    }
    await next();
  });

  // Security headers (apply early)
  app.use('/*', securityHeadersMiddleware());

  // CORS middleware with CSRF protection
  app.use('/*', (c, next) => {
    const allowedOrigins = getAllowedOrigins(c.env, c.req.url);
    const isDevelopment = c.env?.ENVIRONMENT !== 'production' && c.env?.NODE_ENV !== 'production';
    return configureCors({ allowedOrigins, isDevelopment })(c, next);
  });

  // CSRF protection for state-changing requests
  app.use('/*', (c, next) => {
    const allowedOrigins = getAllowedOrigins(c.env, c.req.url);
    const isDevelopment = c.env?.ENVIRONMENT !== 'production' && c.env?.NODE_ENV !== 'production';
    // SECURITY: Require Origin header in production to prevent header stripping attacks
    const requireOrigin = !isDevelopment;
    return csrfProtection({ allowedOrigins, isDevelopment, requireOrigin })(c, next);
  });

  // JSON validation middleware
  app.use('/*', validateJsonMiddleware());

  // Global payload size limit
  app.use('/*', rateLimiters.payloadSizeLimitMiddleware());

  // Health check
  app.get('/', (c) => c.json({ status: 'ok', service: 'bank-cc-sync' }));

  // Central error handler
  app.onError(errorHandler);

  // Web pages (login + dashboard)
  app.route('/', web);

  // Apply auth middleware and rate limiting for protected auth routes
  app.use('/auth/logout', authMiddleware, rateLimiters.logoutRateLimiter);
  app.use('/auth/logout-all', authMiddleware, rateLimiters.logoutRateLimiter);
  app.use('/auth/device/*', authMiddleware, rateLimiters.logoutRateLimiter);
  app.use('/auth/devices', authMiddleware, rateLimiters.logoutRateLimiter);

  // Auth routes (some public, some protected)
  app.route('/auth', createAuthRoutes(rateLimiters));

  // Protected routes with rate limiting
  app.use('/sync/*', authMiddleware, rateLimiters.syncRateLimiter);
  app.use('/shared/*', authMiddleware, rateLimiters.sharedMappingsRateLimiter);
  app.use('/user/*', authMiddleware);

  app.route('/sync', sync);
  app.route('/shared', sharedMappings);
  app.route('/user', user);

  // Admin routes (separate auth + strict rate limiting)
  app.use('/admin/*', rateLimiters.adminRateLimiter);
  app.route('/admin/auth', createAdminAuthRoutes(rateLimiters));
  app.route('/admin', admin);

  return app;
}
