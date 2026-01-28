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
    // SECURITY: Use atomic database-level version check to prevent TOCTOU race conditions
    // where two concurrent requests could both pass the version check and cause data loss.
    // The WHERE clause ensures the update only happens if current version < new version.
    const rowsChanged = await db.upsertSyncBlobAtomic(user.userId, version, encryptedData);
    
    if (rowsChanged === 0) {
      // No rows changed means the WHERE clause failed - version conflict
      const currentBlob = await db.getSyncBlob(user.userId);
      return c.json({ error: 'Version conflict', currentVersion: currentBlob.version }, 409);
    }

    return c.json({ success: true, version });
  } catch (error) {
    console.error('[Sync] Put data error:', error);
    return c.json({ error: 'Failed to save sync data' }, 500);
  }
});

export default sync;
