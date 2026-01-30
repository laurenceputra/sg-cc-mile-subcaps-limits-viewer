/**
 * Rate limit key derivation utilities.
 */

export function getClientIdentifier(c) {
  const cfConnectingIP = c.req.header('CF-Connecting-IP');
  const xForwardedFor = c.req.header('X-Forwarded-For');
  const xRealIP = c.req.header('X-Real-IP');

  const ip =
    cfConnectingIP ||
    (xForwardedFor && xForwardedFor.split(',')[0].trim()) ||
    xRealIP ||
    'unknown';

  const user = c.get('user');
  if (user && user.userId) {
    return `user:${user.userId}:${ip}`;
  }

  if (ip === 'unknown') {
    const body = c.get('validatedBody');
    const email = body?.email;
    if (typeof email === 'string' && email.trim()) {
      const normalized = email.trim().toLowerCase().slice(0, 254);
      return `email:${normalized}:${ip}`;
    }

    const userAgent = c.req.header('User-Agent') || 'unknown';
    const uaToken = userAgent.replace(/\s+/g, ' ').trim().slice(0, 120);
    return `ua:${uaToken}:${c.req.method}:${c.req.path}`;
  }

  return `ip:${ip}`;
}
