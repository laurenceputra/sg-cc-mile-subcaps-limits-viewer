import { Hono } from 'hono';

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

admin.post('/mappings/approve', async (c) => {
  const { merchantNormalized, category, cardType } = await c.req.json();
  
  if (!merchantNormalized || !category || !cardType) {
    return c.json({ error: 'merchantNormalized, category, and cardType required' }, 400);
  }

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
