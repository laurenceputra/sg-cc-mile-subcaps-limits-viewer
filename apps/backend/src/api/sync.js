import { Hono } from 'hono';
import { validateFields } from '../middleware/validation.js';

const sync = new Hono();

sync.get('/data', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  
  try {
    const blob = await db.getSyncBlob(user.userId);
    
    if (!blob) {
      return c.json({ encryptedData: null, version: 0 });
    }

    return c.json({
      encryptedData: JSON.parse(blob.encrypted_data),
      version: blob.version,
      updatedAt: blob.updated_at
    });
  } catch (error) {
    console.error('[Sync] Get data error:', error);
    return c.json({ error: 'Failed to fetch sync data' }, 500);
  }
});

sync.put('/data', 
  validateFields({ encryptedData: 'encryptedData', version: 'version' }),
  async (c) => {
  const user = c.get('user');
  const { encryptedData, version } = c.get('validatedBody') || await c.req.json();

  const db = c.get('db');
  
  try {
    const currentBlob = await db.getSyncBlob(user.userId);
    
    if (currentBlob && currentBlob.version >= version) {
      return c.json({ error: 'Version conflict', currentVersion: currentBlob.version }, 409);
    }

    await db.upsertSyncBlob(user.userId, version, encryptedData);

    return c.json({ success: true, version });
  } catch (error) {
    console.error('[Sync] Put data error:', error);
    return c.json({ error: 'Failed to save sync data' }, 500);
  }
});

export default sync;
