# Packages

Dependency map:

```
@bank-cc/shared
@bank-cc/crypto -> @bank-cc/shared
@bank-cc/sync-client -> @bank-cc/crypto, @bank-cc/shared
apps/backend -> @bank-cc/shared
apps/userscripts/uob-lady-solitaire -> @bank-cc/shared, @bank-cc/sync-client
```

Packages:
- **shared**: cross-app types, validation, and utilities.
- **crypto**: Web Crypto helpers for encrypting sync payloads.
- **sync-client**: client-side sync helpers and crypto manager.
