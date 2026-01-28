import { Hono } from 'hono';
import { normalizeMerchant } from '@bank-cc/shared';

const sharedMappings = new Hono();

sharedMappings.get('/mappings/:cardType', async (c) => {
  const cardType = c.req.param('cardType');
  const db = c.get('db');
  
  try {
    const mappings = await db.getSharedMappings(cardType);
    return c.json({ mappings });
  } catch (error) {
    console.error('[SharedMappings] Get error:', error);
    return c.json({ error: 'Failed to fetch shared mappings' }, 500);
  }
});

sharedMappings.post('/mappings/contribute', async (c) => {
  const user = c.get('user');
  const { mappings } = await c.req.json();
  
  if (!Array.isArray(mappings)) {
    return c.json({ error: 'mappings must be an array' }, 400);
  }

  const db = c.get('db');
  
  try {
    const userData = await db.getUserById(user.userId);
    
    if (userData.tier === 'paid' && !userData.share_mappings) {
      return c.json({ success: true, message: 'Sharing disabled for paid user' });
    }

    await db.contributeMappings(user.userId, mappings);

    return c.json({ success: true, contributed: mappings.length });
  } catch (error) {
    console.error('[SharedMappings] Contribute error:', error);
    return c.json({ error: 'Failed to contribute mappings' }, 500);
  }
});

export default sharedMappings;
