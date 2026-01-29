import { Hono } from 'hono';
import { normalizeMerchant } from '@bank-cc/shared';
import { validateFields, validateInput } from '../middleware/validation.js';

const sharedMappings = new Hono();

sharedMappings.get('/mappings/:cardType', async (c) => {
  // SECURITY: Validate immediately after extraction, before any processing
  const cardType = c.req.param('cardType');
  const cardTypeError = validateInput(cardType, 'cardType');
  if (cardTypeError) {
    return c.json({ error: cardTypeError }, 400);
  }
  if (!['ONE', 'LADY', 'PPV', 'SOLITAIRE'].includes(cardType.toUpperCase())) {
    return c.json({ error: 'Invalid card type' }, 400);
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

    const normalizedMappings = mappings.map((mapping) => ({
      ...mapping,
      merchantRaw: mapping.merchantRaw || mapping.merchantNormalized || mapping.merchant,
      merchant: mapping.merchant || mapping.merchantNormalized || mapping.merchantRaw,
      merchantNormalized: normalizeMerchant(mapping.merchantNormalized || mapping.merchantRaw || mapping.merchant || '')
    }));

    await db.contributeMappings(user.userId, normalizedMappings);

    return c.json({ success: true, contributed: mappings.length });
  } catch (error) {
    console.error('[SharedMappings] Contribute error:', error);
    return c.json({ error: 'Failed to contribute mappings' }, 500);
  }
});

export default sharedMappings;
