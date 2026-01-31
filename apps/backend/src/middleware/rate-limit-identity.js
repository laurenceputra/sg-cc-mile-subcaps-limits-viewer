/**
 * Rate limit key derivation utilities.
 */

const textEncoder = new TextEncoder();

async function hashIdentifier(secret, identifier) {
  const data = textEncoder.encode(`${secret}:${identifier}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function getClientIdentifier(c) {
  const cfConnectingIP = c.req.header('CF-Connecting-IP');
  const xForwardedFor = c.req.header('X-Forwarded-For');
  const xRealIP = c.req.header('X-Real-IP');

  const ip =
    cfConnectingIP ||
    (xForwardedFor && xForwardedFor.split(',')[0].trim()) ||
    xRealIP ||
    'unknown';

  const user = c.get('user');
  let identifier = '';

  if (user && user.userId) {
    identifier = `user:${user.userId}:${ip}`;
  } else if (ip === 'unknown') {
    const body = c.get('validatedBody');
    const email = body?.email;
    if (typeof email === 'string' && email.trim()) {
      const normalized = email.trim().toLowerCase().slice(0, 254);
      identifier = `email:${normalized}:${ip}`;
    } else {
      const userAgent = c.req.header('User-Agent') || 'unknown';
      const uaToken = userAgent.replace(/\s+/g, ' ').trim().slice(0, 120);
      identifier = `ua:${uaToken}:${c.req.method}:${c.req.path}`;
    }
  } else {
    identifier = `ip:${ip}`;
  }

  const secret = c.env?.JWT_SECRET;
  if (typeof secret !== 'string' || !secret.trim()) {
    throw new Error('JWT_SECRET is required for rate limiting');
  }
  return hashIdentifier(secret, identifier);
}
