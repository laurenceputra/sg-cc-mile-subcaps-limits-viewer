import { arrayBufferToBase64, base64ToArrayBuffer } from '@bank-cc/shared/utils';

/**
 * Derive encryption key from passphrase
 * SECURITY: Uses PBKDF2 with 310,000 iterations (OWASP 2023 recommendation)
 * to protect against brute-force attacks on encrypted data at rest.
 * 
 * @param {string} passphrase - User passphrase
 * @param {Uint8Array} salt - Salt for key derivation (must be 16 bytes minimum)
 * @param {number} iterations - PBKDF2 iterations (default: 310000)
 * @returns {Promise<CryptoKey>} - Derived AES-256-GCM key
 */
export async function deriveKey(passphrase, salt, iterations = 310000) {
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
 * SECURITY: AES-GCM provides authenticated encryption, protecting against
 * both confidentiality and integrity attacks. Uses 96-bit random IV per encryption.
 * 
 * @param {CryptoKey} key - Encryption key
 * @param {any} data - Data to encrypt (will be JSON stringified)
 * @returns {Promise<{ciphertext: string, iv: string}>} - Encrypted data with IV
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
 * SECURITY: AES-GCM automatically verifies authentication tag, throwing on tampering.
 * Timing of decryption failure is constant regardless of where tampering occurred.
 * 
 * @param {CryptoKey} key - Decryption key
 * @param {string} ciphertext - Base64 encoded ciphertext
 * @param {string} iv - Base64 encoded IV
 * @returns {Promise<any>} - Decrypted data (JSON parsed)
 * @throws {Error} - On authentication failure or decryption error
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
 * Generate cryptographically random salt
 * SECURITY: Uses crypto.getRandomValues for CSPRNG output.
 * 16 bytes (128 bits) is sufficient for PBKDF2 salt uniqueness.
 * 
 * @returns {Uint8Array} - 16-byte random salt
 */
export function generateSalt() {
  return crypto.getRandomValues(new Uint8Array(16));
}
