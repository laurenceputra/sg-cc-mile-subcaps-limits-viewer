# Phase 3: Sync Integration - Implementation Notes

## Status: ✅ Infrastructure Complete, UI Integration Ready

### What's Been Built

#### 1. Sync Manager (`src/sync-manager.js`)
- Full SyncClient integration
- Setup workflow (register/login)
- Bi-directional sync (pull → merge → push)
- Shared merchant mappings fetch/contribute
- Configuration persistence
- Device management

#### 2. Sync UI (`src/sync-ui.js`)
- Setup wizard (email, passphrase, device name)
- Status display (last sync, tier, sharing preferences)
- Manual sync trigger
- Disable sync option
- Privacy-first messaging

#### 3. Build System
- Rollup configured to bundle sync-client and dependencies
- ES modules properly resolved
- Tampermonkey grants added (`@grant GM_xmlhttpRequest`, `@connect`)
- Version bumped to 0.6.0

### Integration Points (Ready to Activate)

The sync functionality is **fully implemented but commented out** to preserve the working userscript. To activate:

1. **Uncomment imports** in `src/index.user.js`:
   ```javascript
   import { SyncManager } from './sync-manager.js';
   import { createSyncTab } from './sync-ui.js';
   ```

2. **Initialize sync manager** after storage setup:
   ```javascript
   const syncManager = new SyncManager(storage);
   ```

3. **Add Sync tab** in the overlay UI tabs section:
   ```javascript
   const syncTab = createSyncTab(syncManager, settings, THEME);
   overlay.querySelector('#cc-subcap-sync').replaceWith(syncTab);
   ```

4. **Add sync triggers**:
   - On modal close (contribute mappings if enabled)
   - After merchant map changes
   - Background sync every 5 minutes (optional)

### Shared Mappings Flow

**Free Users (Default):**
1. User maps merchant → category locally
2. On modal close, batch upload to `/shared/mappings/contribute`
3. Server stores in `mapping_contributions` table
4. Admin reviews and approves via `/admin/mappings/approve`
5. Approved mappings available via `/shared/mappings/:cardType`
6. Next time user sees unmapped merchant, show suggestion badge
7. User clicks to accept/reject suggestion

**Paid Users (Opt-Out Available):**
- Toggle "Share my merchant mappings" in settings
- If disabled, skip step 2 (no upload)
- Still benefit from shared mappings or can disable entirely

### Backend Deployment

#### Cloudflare Workers (Official Hosted)
```bash
cd apps/backend
wrangler d1 create bank_cc_sync
# Update wrangler.toml with database ID
wrangler d1 execute bank_cc_sync --file=src/storage/schema.sql
wrangler secret put JWT_SECRET
wrangler secret put ADMIN_KEY
npm run deploy
```

#### Docker (Self-Host)
```bash
cd apps/backend/infra/docker
# Create .env file with JWT_SECRET and ADMIN_KEY
docker-compose up -d
```

### Testing Checklist

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

### Security Validation

- [ ] Passphrase never sent to server (only hash)
- [ ] Data encrypted client-side before upload
- [ ] Server cannot decrypt (E2E encryption)
- [ ] JWT tokens expire after 7 days
- [ ] Rate limiting prevents brute force
- [ ] Admin endpoints require separate auth
- [ ] Shared mappings don't expose PII

### Known Limitations

1. **Passphrase hash is simple** - Use proper bcrypt/argon2 in production
2. **No sync conflict UI** - Currently last-write-wins for settings
3. **No offline queue** - Failed syncs must be manually retried
4. **No sync progress** - Large datasets may appear frozen
5. **Admin panel is API-only** - No web UI for approving mappings

### Next Steps (Post Phase 3)

1. Build admin web UI for merchant mapping approvals
2. Add sync conflict resolution UI (manual merge)
3. Implement offline sync queue with retry
4. Add sync progress indicators
5. Create end-to-end tests with mock backend
6. Security audit of crypto implementation
7. Performance testing with large datasets
8. Cross-browser compatibility testing

### File Structure

```
apps/userscripts/uob-lady-solitaire/
├── src/
│   ├── index.user.js       # Main userscript (sync integration commented)
│   ├── config.js           # Build-time server URL config
│   ├── sync-manager.js     # Sync orchestration
│   └── sync-ui.js          # Sync settings UI
├── dist/
│   └── bank-cc-limits-subcap-calculator.user.js  # Built userscript
├── package.json
└── rollup.config.js

packages/
├── shared/                 # Types, validation, utilities
├── crypto/                 # Browser-based encryption
└── sync-client/            # Sync engine, API client, storage

apps/backend/
├── src/
│   ├── api/               # Auth, sync, shared-mappings, admin, user
│   ├── auth/              # JWT utilities
│   ├── storage/           # Database operations + schema
│   ├── index.js           # Hono app
│   ├── middleware.js      # Auth middleware
│   ├── cloudflare-worker.js  # Workers entry point
│   └── node-server.js     # Node/Docker entry point
├── infra/
│   ├── cloudflare/        # wrangler.toml
│   └── docker/            # Dockerfile + docker-compose.yml
└── README.md
```

---

**Phase 3 Complete:** All infrastructure is in place. Final activation requires uncommenting the integration points and testing end-to-end.
