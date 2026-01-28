import { deriveKey, encrypt, decrypt, generateSalt } from '@bank-cc/crypto';

export class CryptoManager {
  constructor(passphrase, salt = null) {
    this.passphrase = passphrase;
    this.salt = salt || generateSalt();
    this.key = null;
  }

  async init() {
    this.key = await deriveKey(this.passphrase, this.salt);
  }

  async encrypt(data) {
    if (!this.key) await this.init();
    const encrypted = await encrypt(this.key, data);
    return {
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      salt: this.arrayBufferToBase64(this.salt)
    };
  }

  async decrypt(ciphertext, iv, saltBase64) {
    if (saltBase64) {
      this.salt = this.base64ToArrayBuffer(saltBase64);
    }
    if (!this.key) await this.init();
    return await decrypt(this.key, ciphertext, iv);
  }

  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
