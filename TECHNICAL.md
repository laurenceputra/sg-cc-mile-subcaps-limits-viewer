# Technical Documentation

## Supported scope

- **Bank/portal**: UOB Personal Internet Banking (PIB)
- **Page**: Credit card transaction listing (`https://pib.uob.com.sg/PIBCust/2FA/processSubmit.do*`)
- **Card**: `LADY'S SOLITAIRE CARD`

## Installation details

1. Install the [Tampermonkey](https://www.tampermonkey.net/) extension.
2. Create a new userscript and paste the contents of `bank-cc-limits-subcap-calculator.user.js`.
3. Save the script and visit the supported UOB PIB card transaction page.
4. Click **Subcap Tools** to open the UI.

## Privacy and safety

- **Read-only**: The script only reads on-screen data. It does not submit forms or trigger transactions.
- **Local-only storage**: Data is stored in Tampermonkey storage or `localStorage` on your device.
- **No remote logging**: The script does not send data to any external service.
- **Retention**: Stored transactions are kept for the last 3 calendar months to support monthly summaries.

## Data extraction details

- **Card name XPath** (must match `TARGET_CARD_NAME`):
  - `/html/body/section/section/section/section/section/section/section/section/div[1]/div/form[1]/div[1]/div/div[1]/div/div[2]/h3`
- **Transactions table body XPath**:
  - `/html/body/section/section/section/section/section/section/section/section/div[1]/div/form[1]/div[9]/div[2]/table/tbody`

If the portal markup changes, update these selectors in `main()`.

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

## Extending to new cards

1. Add a new entry to `CARD_CONFIGS` with categories and subcap slots.
2. Update the card name match in `TARGET_CARD_NAME` (or adjust logic to allow multiple cards).

## Maintenance checklist

- Validate XPath selectors after portal UI updates.
- Verify calculations against a known statement snapshot.
- Re-test in at least one desktop browser.
