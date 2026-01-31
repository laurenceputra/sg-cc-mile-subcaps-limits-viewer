import { Hono } from 'hono';
import { validateFields } from '../middleware/validation.js';
import { logAuditEvent, AuditEventType } from '../audit/logger.js';

const user = new Hono();

user.delete('/data', async (c) => {
  const userAuth = c.get('user');
  const db = c.get('db');
  
  try {
    await db.deleteUserData(userAuth.userId);
    
    // Audit log data deletion
    await logAuditEvent(db, {
      eventType: AuditEventType.DATA_DELETE,
      request: c.req.raw,
      userId: userAuth.userId,
      details: {}
    });
    
    return c.json({ success: true, message: 'All user data deleted' });
  } catch (error) {
    console.error('[User] Delete data error:', error);
    return c.json({ error: 'Failed to delete user data' }, 500);
  }
});

user.get('/export', async (c) => {
  const userAuth = c.get('user');
  const db = c.get('db');
  
  try {
    const blob = await db.getSyncBlob(userAuth.userId);
    const devices = await db.getDevicesByUser(userAuth.userId);
    
    // Audit log data export
    await logAuditEvent(db, {
      eventType: AuditEventType.DATA_EXPORT,
      request: c.req.raw,
      userId: userAuth.userId,
      details: { deviceCount: devices.length }
    });
    
    return c.json({
      syncData: blob ? JSON.parse(blob.encrypted_data) : null,
      devices,
      exportedAt: Date.now()
    });
  } catch (error) {
    console.error('[User] Export error:', error);
    return c.json({ error: 'Failed to export data' }, 500);
  }
});

user.patch('/settings',
  validateFields({ shareMappings: 'boolean' }),
  async (c) => {
  const userAuth = c.get('user');
  const { shareMappings } = c.get('validatedBody') || await c.req.json();

  const db = c.get('db');
  
  try {
    await db.updateUserSettings(userAuth.userId, shareMappings);
    
    // Audit log settings change
    await logAuditEvent(db, {
      eventType: AuditEventType.SETTINGS_CHANGE,
      request: c.req.raw,
      userId: userAuth.userId,
      details: { shareMappings }
    });
    
    return c.json({ success: true });
  } catch (error) {
    console.error('[User] Settings update error:', error);
    return c.json({ error: 'Failed to update settings' }, 500);
  }
});

export default user;
