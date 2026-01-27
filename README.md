# Bank CC Limits Subcap Calculator (Tampermonkey)

A Tampermonkey userscript that reads the UOB Personal Internet Banking portal, extracts credit-card transactions for a supported card, and helps categorize spend into subcaps. The script is **read-only** and does not initiate any transactions. All data stays local to your browser.

## Supported scope

- **Bank/portal**: UOB Personal Internet Banking (PIB)
- **Page**: Credit card transaction listing (matches `https://pib.uob.com.sg/PIBCust/2FA/processSubmit.do*`)
- **Card**: `LADY'S SOLITAIRE CARD`

If the portal markup changes, selectors may need updates (see [Maintenance](#maintenance)).

## Installation

1. Install the [Tampermonkey](https://www.tampermonkey.net/) extension.
2. Create a new userscript and paste the contents of `bank-cc-limits-subcap-calculator.user.js`.
3. Save the script and visit the supported UOB PIB card transaction page.
4. Click **Subcap Tools** to open the UI.

## Privacy and safety

- **Read-only**: The script only reads on-screen data. It does not submit forms or trigger transactions.
- **Local-only storage**: Data is stored in Tampermonkey storage or `localStorage` on your device.
- **No remote logging**: The script does not send data to any external service.
- **Retention**: Stored transactions are kept for the last 3 calendar months to support monthly summaries.

## Troubleshooting

- **Script doesn’t appear**: Ensure the current page URL matches the UOB PIB pattern in the script.
- **No data or wrong data**: The portal DOM may have changed. Update the XPath selectors in `main()` that locate the card name and table body.
- **Incorrect totals**: Check the "Data issues" section in the UI to see if any rows were skipped or had unreadable amounts/dates.

## Maintenance

If the page structure changes, update these selectors:

- Card name XPath in `main()`
- Transactions table body XPath in `main()`

To extend to new cards:

1. Add a new entry to `CARD_CONFIGS` with categories and subcap slots.
2. Update the card name match in `TARGET_CARD_NAME` (or adjust logic to allow multiple cards).

## Disclaimer

This script is **not affiliated with UOB**. Use it only on your own accounts and ensure compliance with the bank’s Terms of Service.

## License

MIT License. See [LICENSE](LICENSE).
