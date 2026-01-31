export function validateCardSettings(settings, cardConfig) {
  if (!settings || typeof settings !== 'object') return false;
  if (!Array.isArray(settings.selectedCategories)) return false;
  if (settings.selectedCategories.length !== cardConfig.subcapSlots) return false;
  const validCategories = new Set([...cardConfig.categories, '']);
  for (const cat of settings.selectedCategories) {
    if (!validCategories.has(cat)) return false;
  }
  const allowedDefaults = new Set(settings.selectedCategories.filter(Boolean));
  allowedDefaults.add('Others');
  if (!allowedDefaults.has(settings.defaultCategory)) return false;
  if (!settings.merchantMap || typeof settings.merchantMap !== 'object') return false;
  return true;
}

export function validateSyncPayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (typeof payload.version !== 'number' || payload.version < 0) return false;
  if (typeof payload.deviceId !== 'string' || !payload.deviceId) return false;
  if (typeof payload.timestamp !== 'number' || payload.timestamp <= 0) return false;
  if (!payload.data || typeof payload.data !== 'object') return false;
  if (!payload.data.cards || typeof payload.data.cards !== 'object') return false;
  return true;
}

export function validateSharedMapping(mapping) {
  if (!mapping || typeof mapping !== 'object') return false;
  if (typeof mapping.merchant !== 'string' || !mapping.merchant) return false;
  if (typeof mapping.suggestedCategory !== 'string' || !mapping.suggestedCategory) return false;
  if (typeof mapping.contributionCount !== 'number' || mapping.contributionCount < 0) return false;
  if (typeof mapping.lastUpdated !== 'number' || mapping.lastUpdated <= 0) return false;
  if (typeof mapping.cardType !== 'string' || !mapping.cardType) return false;
  return true;
}

export function validateServerUrl(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('Server URL is required');
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('Server URL must use HTTP or HTTPS protocol');
    }
  } catch (error) {
    // Re-throw protocol errors as-is
    if (error.message.includes('HTTP')) {
      throw error;
    }
    // For URL parsing errors, provide clearer message
    throw new Error('Invalid URL format');
  }
}
