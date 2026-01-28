/**
 * Derive encryption key from passphrase
 * @param {string} passphrase - User passphrase
 * @param {Uint8Array} salt - Salt for key derivation
 * @param {number} iterations - PBKDF2 iterations (default: 100000)
 * @returns {Promise<CryptoKey>} - Derived key
 */
export async function deriveKey(passphrase, salt, iterations = 100000) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt data with AES-GCM
 * @param {CryptoKey} key - Encryption key
 * @param {any} data - Data to encrypt (will be JSON stringified)
 * @returns {Promise<{ciphertext: string, iv: string}>} - Encrypted data
 */
export async function encrypt(key, data) {
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = enc.encode(JSON.stringify(data));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    plaintext
  );

  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv)
  };
}

/**
 * Decrypt data with AES-GCM
 * @param {CryptoKey} key - Decryption key
 * @param {string} ciphertext - Base64 encoded ciphertext
 * @param {string} iv - Base64 encoded IV
 * @returns {Promise<any>} - Decrypted data (JSON parsed)
 */
export async function decrypt(key, ciphertext, iv) {
  const dec = new TextDecoder();
  const ciphertextBuffer = base64ToArrayBuffer(ciphertext);
  const ivBuffer = base64ToArrayBuffer(iv);

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBuffer },
    key,
    ciphertextBuffer
  );

  return JSON.parse(dec.decode(plaintext));
}

/**
 * Generate random salt
 * @returns {Uint8Array} - Random salt
 */
export function generateSalt() {
  return crypto.getRandomValues(new Uint8Array(16));
}

/**
 * Convert ArrayBuffer to Base64
 * @param {ArrayBuffer} buffer - Buffer to convert
 * @returns {string} - Base64 string
 */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert Base64 to ArrayBuffer
 * @param {string} base64 - Base64 string
 * @returns {ArrayBuffer} - Array buffer
 */
function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
