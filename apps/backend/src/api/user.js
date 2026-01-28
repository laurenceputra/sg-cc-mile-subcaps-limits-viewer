import { Hono } from 'hono';

const user = new Hono();

user.delete('/data', async (c) => {
  const userAuth = c.get('user');
  const db = c.get('db');
  
  try {
    await db.deleteUserData(userAuth.userId);
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

user.patch('/settings', async (c) => {
  const userAuth = c.get('user');
  const { shareMappings } = await c.req.json();
  
  if (typeof shareMappings !== 'boolean') {
    return c.json({ error: 'shareMappings must be a boolean' }, 400);
  }

  const db = c.get('db');
  
  try {
    await db.updateUserSettings(userAuth.userId, shareMappings);
    return c.json({ success: true });
  } catch (error) {
    console.error('[User] Settings update error:', error);
    return c.json({ error: 'Failed to update settings' }, 500);
  }
});

export default user;
