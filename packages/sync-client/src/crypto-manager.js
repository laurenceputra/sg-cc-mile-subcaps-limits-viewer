import { deriveKey, encrypt, decrypt, generateSalt } from '@bank-cc/crypto';
import { arrayBufferToBase64, base64ToArrayBuffer } from '@bank-cc/shared/utils';

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
      salt: arrayBufferToBase64(this.salt)
    };
  }

  async decrypt(ciphertext, iv, saltBase64) {
    if (saltBase64) {
      this.salt = base64ToArrayBuffer(saltBase64);
    }
    if (!this.key) await this.init();
    return await decrypt(this.key, ciphertext, iv);
  }
}
