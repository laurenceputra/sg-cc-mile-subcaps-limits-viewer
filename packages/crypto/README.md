# @bank-cc/crypto

Browser crypto helpers for encrypting sync payloads.

## Exports
- `deriveKey(passphrase, salt, iterations?)`
- `encrypt(key, data)`
- `decrypt(key, ciphertext, iv)`
- `generateSalt()`

## Usage
```js
import { deriveKey, encrypt, decrypt, generateSalt } from '@bank-cc/crypto';
```
