# Technical Documentation

## Repo architecture

- Userscript artifact is stored in `apps/userscript/` (source/build tooling removed from this repo).
- Backend implementation is self-contained in `apps/backend/` (Cloudflare Workers + D1 only).
- Shared behavior between apps is defined by HTTP contracts in `apps/contracts/` (no shared runtime package).

## Supported scope

- **UOB Personal Internet Banking (PIB)**
  - **Page**: Credit card transaction listing (`https://pib.uob.com.sg/PIBCust/2FA/processSubmit.do*`)
  - **Card**: `LADY'S SOLITAIRE CARD`
- **Maybank2u SG**
  - **Page**: Cards transaction listing (`https://cib.maybank2u.com.sg/m2u/accounts/cards*`)
  - **Card**: `XL Rewards Card` (debit-only rows, with `... SGP` auto-categorized as `Local` else `Forex`)

## Installation details

1. Install the [Tampermonkey](https://www.tampermonkey.net/) extension.
2. Create a new userscript and paste the contents of `apps/userscript/bank-cc-limits-subcap-calculator.user.js`.
3. Save the script and visit a supported UOB PIB or Maybank2u SG card transaction page.
4. Click **Subcap Tools** to open the UI.

## Privacy and safety

- **Read-only**: The script only reads on-screen data. It does not submit forms or trigger transactions.
- **Local-only storage**: Data is stored in Tampermonkey storage or `localStorage` on your device.
- **No remote telemetry**: The script does not send analytics or logs to external services.
- **Optional sync**: If the user explicitly enables sync, encrypted settings are sent to the configured sync backend.
- **Retention**: Stored transactions are kept for the last 3 calendar months to support monthly summaries.
- **Sync minimization**: Raw transactions remain local; sync payloads include card settings + monthly totals only.

## Sync behavior notes

- `Sync Now` performs encrypted settings synchronization through `GET /sync/data` and `PUT /sync/data`.
- Sync payload remains card-keyed under a `cards` envelope (`{ cards: { [cardName]: ... } }`), so adding new cards (e.g., `XL Rewards Card`) is backward-compatible and requires no backend schema/API changes.
- `Sync Now` updates only the active card key from the current page and preserves other remote card keys.
- Each synced card payload includes `selectedCategories`, `defaultCategory`, `merchantMap`, and `monthlyTotals`; it excludes raw `transactions`.
- On bank pages with strict `connect-src`, sync/auth network requests use Tampermonkey transport (`GM_xmlhttpRequest`) with `fetch` fallback.
- Userscript auth/sync transport identifies trusted requests with `X-CC-Userscript: tampermonkey-v1`; it does not rely on forcing `Origin`/`Referer` headers.
- `Sync Now` does not create rows in `mapping_contributions` or `shared_mappings`.
- Shared mapping contributions are only written when the client explicitly calls `POST /shared/mappings/contribute`.
- Free tier enables sharing permission by default, but this does not imply automatic contribution on every sync.
- After page reload/login, sync can remain configured as enabled but runtime crypto stays locked until password is re-entered for that browser session.
- Users can opt in to "Remember sync on this device": the local unlock cache is stored per host (`ccSubcapSyncUnlockCache:<hostname>`) with a 30-day rolling TTL, independent of JWT access-token expiry, and is cleared on explicit logout/disable sync. The password is encrypted locally, with ciphertext in userscript storage and device key material kept in browser IndexedDB.
- Legacy unlock cache entries from `ccSubcapSyncUnlockCache` are read for backward compatibility and migrated to the host-scoped key.
- Decrypted payload compatibility is backward-compatible for known legacy layouts (`{ cards: ... }` and card-map-root payloads) and canonical payloads.
- Legacy payloads are auto-migrated to canonical envelope format on the next successful sync write.

## Web dashboard

- `GET /login` serves a login page that accepts the same sync credentials as the userscript (`username` == `email`).
- `GET /dashboard` shows up to 2 recent months of totals for supported cards (`LADY'S SOLITAIRE CARD`, `XL Rewards Card`) with `Refresh` and `Logout` actions.
- `GET /meta/cap-policy` exposes backend-owned cap + severity style policy used by dashboard and userscript visuals.
- Dashboard data is fetched from `GET /sync/data` and decrypted client-side; the backend never receives plaintext.
- Access tokens are short-lived and refreshed via `POST /auth/refresh` using an HttpOnly cookie.
- Session metadata (`token`, `email`, `lastActiveAt`) is stored in browser localStorage; passphrases are not persisted.
- Decryption keys are stored in IndexedDB and cleared after 30 days of inactivity or explicit logout.

## Data extraction details

- **UOB PIB**
  - **Card name XPath**:
    - `/html/body/section/section/section/section/section/section/section/section/div[1]/div/form[1]/div[1]/div/div[1]/div/div[2]/h3`
  - **Transactions table body XPath**:
    - `/html/body/section/section/section/section/section/section/section/section/div[1]/div/form[1]/div[9]/div[2]/table/tbody`

- **Maybank2u SG (XL Rewards Card)**
  - **Card name XPaths** (ordered fallback):
    - `/html/body/div/div/div[1]/div[1]/div[3]/div[2]/div[1]/div/div[1]/div[1]/div[2]/div[2]/span`
    - `//*[contains(translate(normalize-space(.), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "xl rewards card")][1]`
  - **Transactions table body XPaths** (ordered fallback):
    - `/html/body/div/div/div[1]/div[1]/div[3]/div[2]/div[1]/div/div[2]/div/div[2]/div/div/table/tbody`
    - `(//table//tbody)[1]`
  - **Extraction notes**:
    - Only rows where amount text starts with `-` are ingested (debit spend rows).
    - Description ending with `SGP` is categorized as `Local`; other suffixes are categorized as `Forex`.
    - Maybank rows do not expose UOB-style reference numbers, so a deterministic synthetic key is generated for storage dedupe.

If the portal markup changes, update these selectors in `main()`.

## Category mapping behavior

- UOB (`LADY'S SOLITAIRE CARD`) tabs are ordered: **Spend Totals**, **Manage Transactions**, **Sync**.
- Maybank (`XL Rewards Card`) tabs are ordered: **Spend Totals**, **Sync** (Manage tab intentionally hidden).
- Spend Totals transaction expansion uses a shared `details/summary` chevron renderer on both UOB and Maybank cards.
- Existing merchant/category mappings in local storage are still respected during categorization.
- Wildcard matching support remains in the underlying categorization logic for previously stored mappings.

## Cap policy behavior

- Cap/severity display policy is backend-owned (`/meta/cap-policy`) and cached client-side.
- Userscript policy loading order:
  1. fetch from configured sync backend (GM transport when available),
  2. use last successful cached policy,
  3. fallback to embedded defaults.
- UOB Spend Totals uses per-category cap indicators (`750`).
- Maybank Spend Totals uses combined monthly cap indicator (`1000`).
- Raw transactions remain local-only; synced payload remains settings + monthly totals only.

## Userscript test seams

- Userscript unit tests load helpers via `apps/userscript/__tests__/helpers/load-userscript-exports.js`, which sets `globalThis.__CC_SUBCAP_TEST__`.
- In test mode the userscript exports pure helpers and skips DOM/network initialization, so tests can run under `node --test` without a browser.
- Orchestration-focused helpers (for example card-context builders) are exposed only through the test seam and have no runtime API surface.

## Diagnostics and data issues

The UI includes a **Data issues** section when parsing problems occur:

- **Rows with unreadable posting dates**: Posting date text didn’t match the expected format.
- **Rows with unreadable amounts**: Amount text didn’t parse into a number.
- **Rows skipped**: Missing cells or “previous balance” rows.

Use this section to understand why totals might look off.

## Troubleshooting

- **Script doesn’t appear**: Ensure the current page URL matches a supported UOB PIB or Maybank2u SG pattern in the script.
- **No data or wrong data**: The portal DOM may have changed. Update the XPath selectors above.
- **Incorrect totals**: Check the “Data issues” panel for skipped rows or parsing failures.
- **Maybank button missing on cards page**: Ensure URL host/path matches `https://cib.maybank2u.com.sg/m2u/accounts/cards...`; URL-change init calls are queued and replayed after any in-flight init, and the button appears after card match even before table rows finish loading.
- **Button hides after card switch**: The button is hidden whenever card context is invalid/unresolved. Wait for the card name to resolve or return to a supported card and the button will reappear.
- **Button click feels immediate but hides**: Clicks re-check card context immediately; if the card cannot be resolved quickly, the button hides until context is valid again.
- **Maybank XL table updates not reflected**: On XL, table pagination/update rows are auto-ingested while the card context remains valid. If not updating, verify the card name is resolved and selectors still match the transaction table.
- **`Sync is locked...`**: Enter your sync password in the Sync tab to unlock the session after reload/relogin.
- **Remembered unlock stopped working**: Browser storage clear/profile reset can remove the local vault key, or the local remember window may have expired (30-day rolling TTL). Re-enter password and re-enable remembered sync.
- **`Sync failed: Invalid sync payload structure`**: This is a client-side decrypted payload validation error, so backend logs may remain empty. Check browser console diagnostics and reconnect/reset sync data if the remote blob is corrupted.
- **`Unlock failed: CSRF validation failed: Invalid origin`**:
  - Verify backend `ALLOWED_ORIGINS` includes both `https://pib.uob.com.sg` and `https://cib.maybank2u.com.sg` in preview/prod.
  - Confirm request carries trusted userscript header (`X-CC-Userscript: tampermonkey-v1`).
  - `Origin: null`/extension-style origins are treated as non-authoritative and rely on the trusted userscript path; disallowed valid web origins remain blocked.

## Extending to new cards

1. Add a new entry to `CARD_CONFIGS` with categories and subcap slots.
2. Add/update a `PORTAL_PROFILES` entry (URL prefix + XPaths) and ensure `main()` can match the detected card name to your new `CARD_CONFIGS` key.

## Maintenance checklist

- Validate XPath selectors after portal UI updates.
- Verify calculations against a known statement snapshot.
- Re-test in at least one desktop browser.
