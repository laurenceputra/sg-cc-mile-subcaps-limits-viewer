import { Hono } from 'hono';
import { normalizeMerchant } from '@bank-cc/shared';
import { validateFields, validateInput } from '../middleware/validation.js';

const sharedMappings = new Hono();

sharedMappings.get('/mappings/:cardType', async (c) => {
  const cardType = c.req.param('cardType');
  
  // Validate cardType parameter
  const cardTypeError = validateInput(cardType, 'cardType');
  if (cardTypeError) {
    return c.json({ error: cardTypeError }, 400);
  }
  
  const db = c.get('db');
  
  try {
    const mappings = await db.getSharedMappings(cardType);
    return c.json({ mappings });
  } catch (error) {
    console.error('[SharedMappings] Get error:', error);
    return c.json({ error: 'Failed to fetch shared mappings' }, 500);
  }
});

sharedMappings.post('/mappings/contribute',
  validateFields({ mappings: 'mappingsArray' }),
  async (c) => {
  const user = c.get('user');
  const { mappings } = c.get('validatedBody') || await c.req.json();

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
