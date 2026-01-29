# UOB Lady's Solitaire Userscript

Tampermonkey userscript that summarizes UOB Lady's Solitaire credit card spend, tracks subcap categories, and keeps all data local to your browser.

## Quick install

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Use the built script at `dist/bank-cc-limits-subcap-calculator.user.js` (or the root copy at `/bank-cc-limits-subcap-calculator.user.js`).
3. Open the UOB PIB credit card transaction page.
4. Click **Subcap Tools** to open the panel.

## Development

- Entry point: `src/index.user.js`
- Build: `npm run build` (outputs to `dist/`)
- Watch mode: `npm run dev`

## Documentation

- Technical reference and selectors: [../../../TECHNICAL.md](../../../TECHNICAL.md)
- Sync integration notes: [PHASE3.md](PHASE3.md)

## Security and privacy

- Read-only: no form submissions or transactions.
- Local-first: data stored in Tampermonkey storage or localStorage.
- No remote logging by default.
