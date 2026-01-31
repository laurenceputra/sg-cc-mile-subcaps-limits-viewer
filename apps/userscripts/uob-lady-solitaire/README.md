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
2. Use the built script at `dist/bank-cc-limits-subcap-calculator.user.js` (or the root copy at `/bank-cc-limits-subcap-calculator.user.js`).
3. Open the UOB PIB credit card transaction page.
4. Click **Subcap Tools** to open the panel.

## Development

- Entry point (source of truth): `src/index.user.js`
- Build: `npm run build` (outputs to `dist/` and copies `bank-cc-limits-subcap-calculator.user.js` to the repo root)
- Watch mode: `npm run dev`
- Generated artifacts: `dist/bank-cc-limits-subcap-calculator.user.js` and `/bank-cc-limits-subcap-calculator.user.js` — do not edit by hand.

## Documentation

- Technical reference and selectors: [../../../TECHNICAL.md](../../../TECHNICAL.md)

## Sync integration

Sync is **now enabled** in the userscript and bundled into the single `.user.js` file. The sync feature allows you to:
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

The sync server URL is configured in `src/config.js`. The default is:
```javascript
serverUrl: 'https://bank-cc-sync.your-domain.workers.dev'
```

**For self-hosting:** Update the URL in `config.js` before building.

### What's synchronized

- Category selections and default category
- Merchant mappings (including wildcard patterns)
- Subcap slot assignments

### What stays local

- Raw transaction data (never leaves your browser)
- Bank credentials (script doesn't access them)
- Session tokens (only used locally)

### What's built

- **Sync manager** (`src/sync-manager.js`): login/register, pull/merge/push, shared mappings, device management.
- **Sync UI** (`src/sync-ui.js`): setup wizard, status, manual sync, disable sync.
- **Build system**: rollup bundles sync-client dependencies and adds Tampermonkey grants.
- **Integration**: Sync is now fully integrated into the userscript (imports enabled, UI tab added).

### Technical details

- **Single-file bundle**: All sync dependencies are bundled into the `.user.js` file by rollup
- **Encryption**: Uses Web Crypto API for AES-256-GCM encryption
- **Authentication**: JWT tokens with 7-day expiry
- **Storage**: Tampermonkey `GM_getValue`/`GM_setValue` or `localStorage` as fallback
- **Network**: Uses `GM_xmlhttpRequest` for cross-origin requests

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
