# Scripts

Organized helper scripts used for validation and maintenance. These are not part of the automated test suite.

## Security
- `security/final-security-check.js` - End-to-end security verification summary
- `security/test-security-fixes.js` - Validate security fixes
- `security/test-crypto-fixes.js` - Crypto-related checks
- `security/test-edge-cases.js` - Edge case checks
- `security/test-compatibility.js` - Cross-platform compatibility checks

## Database
- `db/test-database-atomic.js` - Atomic database update checks
- `db/test-sql-atomic.js` - SQL atomicity validation

## Maintenance
- `maintenance/validate-fixes.sh` - Validate fix set
