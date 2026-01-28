import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authMiddleware } from './middleware.js';
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

// Health check
app.get('/', (c) => c.json({ status: 'ok', service: 'bank-cc-sync' }));

// Public routes
app.route('/auth', auth);

// Protected routes
app.use('/sync/*', authMiddleware);
app.use('/shared/*', authMiddleware);
app.use('/user/*', authMiddleware);

app.route('/sync', sync);
app.route('/shared', sharedMappings);
app.route('/user', user);

// Admin routes (separate auth)
app.route('/admin', admin);

export default app;
