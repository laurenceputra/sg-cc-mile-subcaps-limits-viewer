# Bank CC Limits Subcap Calculator

Monorepo for the UOB credit-card userscript and the optional sync backend. Everything is designed to be read-only and local-first by default.

## Projects

- **Userscript (UOB Lady's Solitaire)** — `apps/userscripts/uob-lady-solitaire/`  
  Tampermonkey userscript that summarizes spend and manages subcap categories.  
  Docs: [apps/userscripts/uob-lady-solitaire/README.md](apps/userscripts/uob-lady-solitaire/README.md)  
  Installable build: [bank-cc-limits-subcap-calculator.user.js](bank-cc-limits-subcap-calculator.user.js) (generated; source of truth is `apps/userscripts/uob-lady-solitaire/src/index.user.js`)

- **Sync backend** — `apps/backend/`  
  Optional API for encrypted settings sync and shared mappings.  
  Docs: [apps/backend/README.md](apps/backend/README.md)

- **Shared packages** — `packages/`  
  `shared`, `crypto`, and `sync-client` libraries used by the apps.

## Quick userscript install

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Add the script from `bank-cc-limits-subcap-calculator.user.js` (generated artifact; do not edit by hand).
3. Open your UOB PIB credit card transaction page.
4. Click **Subcap Tools** to view totals and manage categories.

## Documentation

**Getting Started:**
- **User flows and capabilities**: [USER_FLOWS.md](USER_FLOWS.md) - Complete guide to all features
- **Visual flow diagrams**: [USER_FLOW_DIAGRAMS.md](USER_FLOW_DIAGRAMS.md) - Illustrated workflows

**Technical References:**
- Userscript technical reference: [TECHNICAL.md](TECHNICAL.md)
- Sync integration notes: [apps/userscripts/uob-lady-solitaire/README.md](apps/userscripts/uob-lady-solitaire/README.md)
- Backend deployment: [apps/backend/README.md](apps/backend/README.md)

**Security & Development:**
- Security-first workflow: [AGENTS.md](AGENTS.md)
- Crypto security analysis: [CRYPTO_SECURITY_ANALYSIS.md](CRYPTO_SECURITY_ANALYSIS.md)
- Current status: [PHASES_4B_5_COMPLETE.md](PHASES_4B_5_COMPLETE.md)

## Disclaimer

Not affiliated with UOB. Use only on your own accounts and comply with the bank’s Terms of Service.

## License

MIT License. See [LICENSE](LICENSE).
