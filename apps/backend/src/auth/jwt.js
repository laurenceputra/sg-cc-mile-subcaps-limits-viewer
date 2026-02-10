/**
 * Constant-time string comparison to prevent timing attacks
 * SECURITY: Always compares full length regardless of where mismatch occurs,
 * preventing attackers from using timing information to forge signatures.
 * Performs dummy computation on length mismatch to prevent length-based timing leaks.
 * 
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {boolean} - True if strings match
 */
export function constantTimeEqual(a, b) {
  // Track length mismatch but don't early return to prevent timing leak
  const lengthMismatch = a.length !== b.length;
  
  // Always compare at least one string's length to prevent timing leak
  // Use the longer length to ensure we always do work
  const maxLength = Math.max(a.length, b.length);
  
  let result = 0;
  for (let i = 0; i < maxLength; i++) {
    // Use modulo to wrap around for shorter string (prevents index out of bounds)
    // This ensures we always do the same amount of work regardless of length match
    const aChar = a.charCodeAt(i % (a.length || 1));
    const bChar = b.charCodeAt(i % (b.length || 1));
    result |= aChar ^ bChar;
  }
  
  // Factor in length mismatch to final result
  return result === 0 && !lengthMismatch;
}

export async function generateToken(userId, secret, options = {}) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const { ttlSeconds = 7 * 24 * 60 * 60, role } = options;
  const randomBytes = crypto.getRandomValues(new Uint8Array(16));
  const randomPart = Array.from(randomBytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const payload = {
    userId,
    jti: `${userId}_${now}_${randomPart}`, // Unique token ID
    iat: now,
    exp: now + ttlSeconds
  };
  if (role) {
    payload.role = role;
  }

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmacSha256(`${encodedHeader}.${encodedPayload}`, secret);
  
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export async function verifyToken(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token');

  const [header, payload, signature] = parts;
  const decodedHeader = JSON.parse(base64UrlDecode(header));
  if (decodedHeader.alg !== 'HS256') {
    throw new Error('Invalid algorithm');
  }
  const expectedSignature = await hmacSha256(`${header}.${payload}`, secret);
  
  // SECURITY: Use constant-time comparison to prevent timing attacks
  // that could allow signature forgery through timing side-channels
  if (!constantTimeEqual(signature, expectedSignature)) {
    throw new Error('Invalid signature');
  }

  const decodedPayload = JSON.parse(base64UrlDecode(payload));
  
  if (decodedPayload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired');
  }

  return decodedPayload;
}

async function hmacSha256(data, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return base64UrlEncode(signature);
}

function base64UrlEncode(data) {
  const str = typeof data === 'string' ? data : String.fromCharCode(...new Uint8Array(data));
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = str.length % 4;
  if (padding) {
    str += '='.repeat(4 - padding);
  }
  return atob(str);
}
