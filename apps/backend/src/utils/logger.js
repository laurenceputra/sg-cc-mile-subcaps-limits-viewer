const redactKeys = new Set(['password', 'passwordHash', 'passphrase', 'token', 'jwt', 'secret', 'key', 'apiKey']);

function sanitizeMeta(meta = {}, seen = new WeakSet()) {
  if (!meta || typeof meta !== 'object') return meta;
  if (seen.has(meta)) {
    return '[Circular]';
  }
  seen.add(meta);
  const sanitized = Array.isArray(meta) ? [] : {};
  for (const [key, value] of Object.entries(meta)) {
    if (redactKeys.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      sanitized[key] = sanitizeMeta(value, seen);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function log(level, message, meta) {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString()
  };
  if (meta !== undefined) {
    entry.meta = sanitizeMeta(meta);
  }
  const payload = JSON.stringify(entry);
  const output = level === 'error' ? console.error : console.log;
  output(payload);
}

export const logger = {
  info: (message, meta) => log('info', message, meta),
  warn: (message, meta) => log('warn', message, meta),
  error: (message, meta) => log('error', message, meta)
};
