import { Hono } from 'hono';
import { validateFields } from '../middleware/validation.js';
import { logAuditEvent, AuditEventType } from '../audit/logger.js';

const admin = new Hono();

// Simple admin auth middleware (extend with proper admin role check)
admin.use('/*', async (c, next) => {
  const adminKey = c.req.header('X-Admin-Key');
  
  if (adminKey !== c.env.ADMIN_KEY) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  await next();
});

admin.get('/mappings/pending', async (c) => {
  const db = c.get('db');
  
  try {
    const pending = await db.getPendingContributions();
    
    // Audit log admin viewing pending mappings
    await logAuditEvent(db, {
      eventType: AuditEventType.ADMIN_VIEW_PENDING,
      request: c.req.raw,
      userId: null, // Admin action, no user ID
      details: { pendingCount: pending.length }
    });
    
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
    
    // Audit log admin approval
    await logAuditEvent(db, {
      eventType: AuditEventType.ADMIN_MAPPING_APPROVE,
      request: c.req.raw,
      userId: null, // Admin action, no user ID
      details: { merchantNormalized, category, cardType }
    });
    
    return c.json({ success: true });
  } catch (error) {
    console.error('[Admin] Approve error:', error);
    return c.json({ error: 'Failed to approve mapping' }, 500);
  }
});

export default admin;
