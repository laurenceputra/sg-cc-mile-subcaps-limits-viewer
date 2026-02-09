export function validateSyncPayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (typeof payload.version !== 'number' || payload.version < 0) return false;
  if (typeof payload.deviceId !== 'string' || !payload.deviceId) return false;
  if (typeof payload.timestamp !== 'number' || payload.timestamp <= 0) return false;
  if (!payload.data || typeof payload.data !== 'object') return false;
  if (!payload.data.cards || typeof payload.data.cards !== 'object') return false;
  return true;
}

export function validateServerUrl(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('Server URL is required');
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch (error) {
    throw new Error('Invalid URL format');
  }

  const allowedProtocols = ['http:', 'https:'];
  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new Error('Server URL must use HTTP or HTTPS protocol');
  }
}
