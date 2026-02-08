# UOB Lady's Solitaire Userscript

Tampermonkey userscript that summarizes UOB Lady's Solitaire credit card spend, tracks subcap categories, and keeps all data local to your browser.

## Features

- **Spend tracking**: Extract and categorize credit card transactions
- **Subcap management**: Track spending across multiple category slots
- **Wildcard matching**: Use patterns like `STARBUCKS*` to automatically categorize merchants with manual pattern entry UI
- **Local-first**: All data stored in your browser
- **Optional sync**: End-to-end encrypted sync available (ready to use, see Sync section below)

## Quick install

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Use the single-file script at `src/index.user.js`.
3. Open the UOB PIB credit card transaction page.
4. Click **Subcap Tools** to open the panel.

## Development

- Single-file source of truth: `src/index.user.js`
- No build step is required; edit the file directly.

## Documentation

- Technical reference and selectors: [../../../TECHNICAL.md](../../../TECHNICAL.md)

## Sync integration

Sync is **now enabled** in the userscript and included directly in the single `.user.js` file. The sync feature allows you to:
- Synchronize settings and merchant mappings across devices
- End-to-end encryption (data encrypted client-side before upload)
- Optional sharing of merchant mappings with the community

### How to use sync

1. Install the userscript (see Quick install above)
2. Open the **Subcap Tools** panel
3. Click the **Sync** tab
4. Click **Setup Sync** and follow the wizard:
   - Enter your email and create a passphrase
   - Your passphrase is never sent to the server (only a hash for authentication)
   - All data is encrypted locally before upload
5. Your settings will sync automatically across devices

### Configuration

The sync server URL is configured in `src/index.user.js` via `SYNC_CONFIG`. The default is:
```javascript
serverUrl: 'https://bank-cc-sync.your-domain.workers.dev'
```

**For self-hosting:** Update the URL in `src/index.user.js`.

### What's synchronized

- Category selections and default category
- Merchant mappings (including wildcard patterns)
- Subcap slot assignments

### What stays local

- Raw transaction data (never leaves your browser)
- Bank credentials (script doesn't access them)
- Session tokens (only used locally)

### What's built

- **Sync manager/UI**: login/register, pull/merge/push, shared mappings, device management, setup wizard, status, manual sync, disable sync.
- **Build system**: none; sync code lives directly in the userscript.
- **Integration**: Sync is fully integrated into the userscript (UI tab included).

### Technical details

- **Single-file bundle**: All sync dependencies live directly in the `.user.js` file
- **Encryption**: Uses Web Crypto API for AES-256-GCM encryption
- **Authentication**: JWT tokens with 7-day expiry
- **Storage**: Tampermonkey `GM_getValue`/`GM_setValue` or `localStorage` as fallback
- **Network**: Uses `fetch` with Tampermonkey `@connect` permissions

### Shared mappings flow

**Free users (default):**
1. User maps merchant → category locally
2. On modal close, upload to `/shared/mappings/contribute`
3. Admin approves via `/admin/mappings/approve`
4. Approved mappings available via `/shared/mappings/:cardType`
5. Suggestions appear for new merchants

**Paid users (opt-out available):**
- Toggle “Share my merchant mappings” in settings
- If disabled, no upload occurs

### Testing checklist

- [ ] Sync setup wizard works
- [ ] Login/register creates account
- [ ] Device registration succeeds
- [ ] Pull fetches encrypted data
- [ ] Push uploads encrypted data
- [ ] Merge resolves conflicts correctly
- [ ] Shared mappings fetch works
- [ ] Contribute mappings respects sharing preference
- [ ] Admin can approve pending contributions
- [ ] Approved mappings show as suggestions
- [ ] Disable sync clears config
- [ ] Build produces valid userscript

### Security validation

- [ ] Passphrase never sent to server (only hash)
- [ ] Data encrypted client-side before upload
- [ ] Server cannot decrypt (E2E encryption)
- [ ] JWT tokens expire after 7 days
- [ ] Rate limiting prevents brute force
- [ ] Admin endpoints require separate auth
- [ ] Shared mappings don't expose PII

### Known limitations

1. Passphrase hash is simple (use bcrypt/argon2 in production)
2. No sync conflict UI (last-write-wins)
3. No offline queue (manual retry)
4. No sync progress indicator
5. Admin panel is API-only

## Security and privacy

- Read-only: no form submissions or transactions.
- Local-first: data stored in Tampermonkey storage or localStorage.
- No remote logging by default.
