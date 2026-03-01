# Bank CC Limits Subcap Calculator

Monorepo for the UOB credit-card userscript and the optional sync backend. Everything is designed to be read-only and local-first by default.

## Projects

- **Userscript (UOB + Maybank)** — `apps/userscript/bank-cc-limits-subcap-calculator.user.js`  
  Tampermonkey userscript that summarizes spend and manages subcap categories.  
  Installable build: [apps/userscript/bank-cc-limits-subcap-calculator.user.js](apps/userscript/bank-cc-limits-subcap-calculator.user.js) (canonical copy)

- **Sync backend** — `apps/backend/`  
  Optional API for encrypted settings sync and shared mappings (Cloudflare Workers + D1).  
  Docs: [apps/backend/README.md](apps/backend/README.md)

## Architecture

- Apps are isolated under `apps/`:
  - `apps/userscript` (userscript artifact)
  - `apps/backend`
- Integration is contract-only over HTTP.
- Shared API contracts and JSON schemas live in `apps/contracts/`.

## Quick userscript install

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Add the script from `apps/userscript/bank-cc-limits-subcap-calculator.user.js`.
3. Open a supported credit card transaction page:
   - UOB PIB (`LADY'S SOLITAIRE CARD`)
   - Maybank2u SG (`XL Rewards Card`) — debit-only rows, with `... SGP` auto-categorized as `Local` (else `Forex`)
4. Click **Subcap Tools** to view **Spend Totals** and **Sync**.

## Sync privacy model

- Raw transactions remain local to your browser.
- Synced encrypted payload contains card settings + monthly totals only.
- `Sync Now` updates the active card key while preserving other remote card keys.

## Documentation

**Getting Started:**
- **User flows and capabilities**: [USER_FLOWS.md](USER_FLOWS.md) - Complete guide to all features
- **Visual flow diagrams**: [USER_FLOW_DIAGRAMS.md](USER_FLOW_DIAGRAMS.md) - Illustrated workflows

**Technical References:**
- Userscript technical reference: [TECHNICAL.md](TECHNICAL.md)
- Sync integration notes: [apps/contracts/sync-api.md](apps/contracts/sync-api.md)
- Backend deployment: [apps/backend/README.md](apps/backend/README.md)

**Security & Development:**
- Security-first workflow: [AGENTS.md](AGENTS.md)
- Crypto security analysis: [CRYPTO_SECURITY_ANALYSIS.md](CRYPTO_SECURITY_ANALYSIS.md)
- Current status: [PHASES_4B_5_COMPLETE.md](PHASES_4B_5_COMPLETE.md)

## Testing

- Userscript tests: `npm run test:userscript`
- Backend tests: `npm --prefix apps/backend test`
- Coverage: `npm run test:userscript:coverage` and `npm --prefix apps/backend run test:coverage`
- Anti-pattern guardrails: `npm run test:anti-patterns`

## Disclaimer

Not affiliated with UOB. Use only on your own accounts and comply with the bank’s Terms of Service.

## License

MIT License. See [LICENSE](LICENSE).
