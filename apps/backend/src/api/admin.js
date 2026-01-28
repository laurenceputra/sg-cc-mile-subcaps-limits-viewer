import { Hono } from 'hono';
import { validateFields } from '../middleware/validation.js';

const admin = new Hono();

// Simple admin auth middleware (extend with proper admin role check)
admin.use('/*', async (c, next) => {
  const adminKey = c.req.header('X-Admin-Key');
  
  if (adminKey !== (c.env.ADMIN_KEY || 'admin-dev-key')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  await next();
});

admin.get('/mappings/pending', async (c) => {
  const db = c.get('db');
  
  try {
    const pending = await db.getPendingContributions();
    return c.json({ pending });
  } catch (error) {
    console.error('[Admin] Get pending error:', error);
    return c.json({ error: 'Failed to fetch pending contributions' }, 500);
  }
});

admin.post('/mappings/approve',
  validateFields({ 
    merchantNormalized: 'merchantName', 
    category: 'category', 
    cardType: 'cardType' 
  }),
  async (c) => {
  const { merchantNormalized, category, cardType } = c.get('validatedBody') || await c.req.json();

  const db = c.get('db');
  
  try {
    await db.approveMappings(merchantNormalized, category, cardType);
    return c.json({ success: true });
  } catch (error) {
    console.error('[Admin] Approve error:', error);
    return c.json({ error: 'Failed to approve mapping' }, 500);
  }
});

export default admin;
