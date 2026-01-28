import { Hono } from 'hono';
import { authMiddleware } from './middleware/auth.js';
import { 
  payloadSizeLimitMiddleware,
  syncRateLimiter,
  sharedMappingsRateLimiter,
  adminRateLimiter
} from './middleware/rate-limiter.js';
import { configureCors, csrfProtection } from './middleware/csrf.js';
import { validateJsonMiddleware } from './middleware/validation.js';
import { securityHeadersMiddleware } from './middleware/security-headers.js';
import auth from './api/auth.js';
import sync from './api/sync.js';
import sharedMappings from './api/shared-mappings.js';
import admin from './api/admin.js';
import user from './api/user.js';

const app = new Hono();

// Parse allowed origins from environment
const getAllowedOrigins = (env) => {
  const origins = env?.ALLOWED_ORIGINS || 'https://pib.uob.com.sg';
  return origins.split(',').map(o => o.trim()).filter(Boolean);
};

// Security headers (apply early)
app.use('/*', securityHeadersMiddleware());

// CORS middleware with CSRF protection
app.use('/*', (c, next) => {
  const allowedOrigins = getAllowedOrigins(c.env);
  const isDevelopment = c.env?.ENVIRONMENT !== 'production' && c.env?.NODE_ENV !== 'production';
  return configureCors({ allowedOrigins, isDevelopment })(c, next);
});

// CSRF protection for state-changing requests
app.use('/*', (c, next) => {
  const allowedOrigins = getAllowedOrigins(c.env);
  const isDevelopment = c.env?.ENVIRONMENT !== 'production' && c.env?.NODE_ENV !== 'production';
  return csrfProtection({ allowedOrigins, isDevelopment, requireOrigin: false })(c, next);
});

// JSON validation middleware
app.use('/*', validateJsonMiddleware());

// Global payload size limit
app.use('/*', payloadSizeLimitMiddleware());

// Health check
app.get('/', (c) => c.json({ status: 'ok', service: 'bank-cc-sync' }));

// Apply auth middleware for protected auth routes
app.use('/auth/logout*', authMiddleware);
app.use('/auth/device/*', authMiddleware);
app.use('/auth/devices', authMiddleware);

// Auth routes (some public, some protected)
app.route('/auth', auth);

// Protected routes with rate limiting
app.use('/sync/*', authMiddleware, syncRateLimiter);
app.use('/shared/*', authMiddleware, sharedMappingsRateLimiter);
app.use('/user/*', authMiddleware);

app.route('/sync', sync);
app.route('/shared', sharedMappings);
app.route('/user', user);

// Admin routes (separate auth + strict rate limiting)
app.use('/admin/*', adminRateLimiter);
app.route('/admin', admin);

export default app;
