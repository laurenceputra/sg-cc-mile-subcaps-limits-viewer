# UOB Lady's Solitaire Userscript

Tampermonkey userscript that summarizes UOB Lady's Solitaire credit card spend, tracks subcap categories, and keeps all data local to your browser.

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

## Sync integration (optional)

Sync is implemented but intentionally disabled in the userscript to preserve the current local-only behavior. To enable it, follow the steps below.

### What's built

- **Sync manager** (`src/sync-manager.js`): login/register, pull/merge/push, shared mappings, device management.
- **Sync UI** (`src/sync-ui.js`): setup wizard, status, manual sync, disable sync.
- **Build system**: rollup bundles sync-client dependencies and adds Tampermonkey grants.

### Activation steps

1. **Uncomment imports** in `src/index.user.js`:
   ```javascript
   import { SyncManager } from './sync-manager.js';
   import { createSyncTab } from './sync-ui.js';
   ```

2. **Initialize the sync manager** after storage setup:
   ```javascript
   const syncManager = new SyncManager(storage);
   ```

3. **Add the Sync tab** in the overlay UI section:
   ```javascript
   const syncTab = createSyncTab(syncManager, settings, THEME);
   overlay.querySelector('#cc-subcap-sync').replaceWith(syncTab);
   ```

4. **Add sync triggers**:
   - On modal close (contribute mappings if enabled)
   - After merchant mapping changes
   - Background sync every 5 minutes (optional)

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
