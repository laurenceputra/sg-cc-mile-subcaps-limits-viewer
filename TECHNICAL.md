# Technical Documentation

## Repo architecture

- Userscript artifact is stored in `apps/userscript/` (source/build tooling removed from this repo).
- Backend implementation is self-contained in `apps/backend/` (Cloudflare Workers + D1 only).
- Shared behavior between apps is defined by HTTP contracts in `apps/contracts/` (no shared runtime package).

## Supported scope

- **Bank/portal**: UOB Personal Internet Banking (PIB)
- **Page**: Credit card transaction listing (`https://pib.uob.com.sg/PIBCust/2FA/processSubmit.do*`)
- **Card**: `LADY'S SOLITAIRE CARD`

## Installation details

1. Install the [Tampermonkey](https://www.tampermonkey.net/) extension.
2. Create a new userscript and paste the contents of `apps/userscript/bank-cc-limits-subcap-calculator.user.js`.
3. Save the script and visit the supported UOB PIB card transaction page.
4. Click **Subcap Tools** to open the UI.

## Privacy and safety

- **Read-only**: The script only reads on-screen data. It does not submit forms or trigger transactions.
- **Local-only storage**: Data is stored in Tampermonkey storage or `localStorage` on your device.
- **No remote telemetry**: The script does not send analytics or logs to external services.
- **Optional sync**: If the user explicitly enables sync, encrypted settings are sent to the configured sync backend.
- **Retention**: Stored transactions are kept for the last 3 calendar months to support monthly summaries.

## Sync behavior notes

- `Sync Now` performs encrypted settings synchronization through `GET /sync/data` and `PUT /sync/data`.
- `Sync Now` does not create rows in `mapping_contributions` or `shared_mappings`.
- Shared mapping contributions are only written when the client explicitly calls `POST /shared/mappings/contribute`.
- Free tier enables sharing permission by default, but this does not imply automatic contribution on every sync.
- Decrypted payload compatibility is backward-compatible for known legacy layouts (`{ cards: ... }` and card-map-root payloads) and canonical payloads.
- Legacy payloads are auto-migrated to canonical envelope format on the next successful sync write.

## Data extraction details

- **Card name XPath** (must match `TARGET_CARD_NAME`):
  - `/html/body/section/section/section/section/section/section/section/section/div[1]/div/form[1]/div[1]/div/div[1]/div/div[2]/h3`
- **Transactions table body XPath**:
  - `/html/body/section/section/section/section/section/section/section/section/div[1]/div/form[1]/div[9]/div[2]/table/tbody`

If the portal markup changes, update these selectors in `main()`.

## Category mapping with wildcard support

The script allows you to assign merchants to categories manually. As of version 0.6.0, **wildcard matching** is supported for flexible merchant categorization:

### How to use wildcards

**Method 1: Add wildcard pattern manually (recommended)**
1. Open the **Subcap Tools** panel
2. Navigate to the **Manage Transactions** tab
3. Scroll to the **"Add Wildcard Pattern"** section at the bottom
4. Enter a pattern (e.g., `STARBUCKS*` or `*GRAB*`)
5. Select the category to assign
6. Click **Add**

**Method 2: Categorize existing merchants**
1. Wait for a transaction from the merchant to appear on the page
2. Find the merchant in the categorization list
3. Select a category - the pattern can then be edited to use wildcards via browser console or by re-adding it with the wildcard form

### Pattern syntax

- Use `*` as a wildcard character to match any sequence of characters except literal `*`
- Escape literal asterisks with `\*` (e.g., `KrisPay\*Paradise*`)
- Wildcards can appear at the beginning, middle, or end of a pattern
- Matching is **case-insensitive**

### Examples

| Pattern | Matches | Does not match |
|---------|---------|----------------|
| `STARBUCKS*` | STARBUCKS SINGAPORE, STARBUCKS ORCHARD | MCDONALDS |
| `*STARBUCKS` | SINGAPORE STARBUCKS, THE STARBUCKS | STARBUCKS DOWNTOWN |
| `STARBUCKS*CAFE` | STARBUCKS SINGAPORE CAFE | STARBUCKS SINGAPORE |
| `*GRAB*` | GRAB SINGAPORE, GRABTAXI, THE GRAB APP, MY GRAB RIDE | UBER, GOJEK |
| `KrisPay\*Paradise*` | KrisPay*Paradise C Singapore SG | KrisPay Paradise C Singapore SG |

### Matching priority

1. **Exact match** (case-sensitive) is checked first (for backward compatibility and performance)
2. **Case-insensitive exact match** for non-wildcard patterns is checked second
3. **Wildcard patterns** are checked if no exact match is found
4. **Default category** is used if no match is found

This allows you to create flexible rules like `GRAB*` to categorize all Grab-related merchants as "Transport" without having to add each variant individually.

## Diagnostics and data issues

The UI includes a **Data issues** section when parsing problems occur:

- **Rows with unreadable posting dates**: Posting date text didn’t match the expected format.
- **Rows with unreadable amounts**: Amount text didn’t parse into a number.
- **Rows skipped**: Missing cells or “previous balance” rows.

Use this section to understand why totals might look off.

## Troubleshooting

- **Script doesn’t appear**: Ensure the current page URL matches the UOB PIB pattern in the script.
- **No data or wrong data**: The portal DOM may have changed. Update the XPath selectors above.
- **Incorrect totals**: Check the “Data issues” panel for skipped rows or parsing failures.
- **`Sync failed: Invalid sync payload structure`**: This is a client-side decrypted payload validation error, so backend logs may remain empty. Check browser console diagnostics and reconnect/reset sync data if the remote blob is corrupted.

## Extending to new cards

1. Add a new entry to `CARD_CONFIGS` with categories and subcap slots.
2. Update the card name match in `TARGET_CARD_NAME` (or adjust logic to allow multiple cards).

## Maintenance checklist

- Validate XPath selectors after portal UI updates.
- Verify calculations against a known statement snapshot.
- Re-test in at least one desktop browser.
