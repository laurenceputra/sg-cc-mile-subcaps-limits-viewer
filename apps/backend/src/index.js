import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authMiddleware } from './middleware/auth.js';
import { 
  payloadSizeLimitMiddleware,
  syncRateLimiter,
  sharedMappingsRateLimiter,
  adminRateLimiter
} from './middleware/rate-limiter.js';
import auth from './api/auth.js';
import sync from './api/sync.js';
import sharedMappings from './api/shared-mappings.js';
import admin from './api/admin.js';
import user from './api/user.js';

const app = new Hono();

// CORS middleware
app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key']
}));

// Global payload size limit
app.use('/*', payloadSizeLimitMiddleware());

// Health check
app.get('/', (c) => c.json({ status: 'ok', service: 'bank-cc-sync' }));

// Public routes (rate limiting applied per endpoint in auth.js)
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
