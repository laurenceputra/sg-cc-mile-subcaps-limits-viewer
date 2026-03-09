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
- When sync is enabled, the userscript attempts background sync for the active card after table-driven local state changes on supported bank pages (if unlocked or remembered unlock is available).

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
- Workflow gates (canonical): [docs/workflow/gates.md](docs/workflow/gates.md)
- Workflow handoff contract: [docs/workflow/handoff-format.md](docs/workflow/handoff-format.md)
- Skill catalog: [.agents/skills/README.md](.agents/skills/README.md)
- Crypto security analysis: [CRYPTO_SECURITY_ANALYSIS.md](CRYPTO_SECURITY_ANALYSIS.md)
- Current status: [PHASES_4B_5_COMPLETE.md](PHASES_4B_5_COMPLETE.md)

## Testing

- Userscript tests: `npm run test:userscript`
- Backend tests: `npm --prefix apps/backend test`
- Coverage: `npm run test:userscript:coverage` and `npm --prefix apps/backend run test:coverage`
- Anti-pattern guardrails: `npm run test:anti-patterns`

### Anti-pattern checker scope

- `npm run test:anti-patterns` is a fast static guardrail for known blocked patterns.
- It catches high-confidence syntax patterns (for example callback execution during listener registration, synchronous timer callback shortcuts, direct worker-test imports from `apps/backend/src/api/*.js`, and broad alternation regex in `assert.rejects`).
- It does **not** replace manual review for semantic anti-patterns (for example weak behavior assertions, permissive default mocks, or order-dependent shared state).

## Disclaimer

Not affiliated with UOB. Use only on your own accounts and comply with the bank’s Terms of Service.

## License

MIT License. See [LICENSE](LICENSE).
