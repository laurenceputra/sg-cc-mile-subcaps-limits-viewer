# User Flows Documentation

This document explains all user flows and capabilities in the Bank CC Limits Subcap Calculator application.

## Overview

The Bank CC Limits Subcap Calculator is a browser-based tool for UOB Lady's Solitaire credit card users to:
- Track spending across subcap categories
- Manage merchant categorizations with wildcard patterns
- Optionally sync settings across devices with end-to-end encryption
- View monthly spending summaries

**Privacy-First Design:**
- All data processing happens in your browser
- Raw transaction data never leaves your device
- Optional sync uses client-side encryption
- Read-only script - no form submissions

---

## 1. Primary User Flow: Transaction Tracking & Categorization

### 1.1 Initial Setup

**Prerequisites:**
- UOB Lady's Solitaire credit card
- Access to UOB Personal Internet Banking (PIB)
- Browser with Tampermonkey extension installed

**Setup Steps:**
1. Install [Tampermonkey](https://www.tampermonkey.net/) browser extension
2. Install the userscript from `bank-cc-limits-subcap-calculator.user.js`
3. Navigate to your UOB PIB credit card transaction page
   - URL pattern: `https://pib.uob.com.sg/PIBCust/2FA/processSubmit.do*`

**What Happens:**
- Script automatically detects if you're on the correct page
- Verifies you're viewing the Lady's Solitaire card
- Adds a **"Subcap Tools"** button to the bottom-right corner of the page

### 1.2 Viewing Transaction Summaries

**User Action:** Click the "Subcap Tools" button

**The Panel Opens with Three Tabs:**
1. **Spend Totals** (default view)
2. **Manage Transactions**
3. **Sync** (optional feature)

#### Spend Totals Tab

**What You See:**
- **Monthly Cards**: One card per calendar month (last 3 months)
  - Month and year header
  - Total spending for that month
  - Breakdown by category (e.g., Dining, Transport, Beauty & Wellness)
  - Visual cap warnings:
    - 🔴 **Red alert**: Category exceeded $750 cap
    - ⚡ **Yellow warning**: Category approaching $750 cap (e.g., > $700)
  
- **Transaction Details** (expandable):
  - Click any category to see individual transactions
  - Shows: Merchant name, Date, Amount
  - Transactions are automatically categorized based on your merchant mappings

**User Actions:**
- View spending by category
- Identify which categories are approaching limits
- Expand/collapse transaction details
- Switch between months to compare spending patterns

### 1.3 Managing Categories & Subcap Slots

**User Action:** Navigate to the "Manage Transactions" tab

**What You See:**

#### Top Section: Subcap Slot Configuration
- **2 Subcap Slots** (for Lady's Solitaire card)
- Dropdown for each slot to select a category
- Available categories:
  - Beauty & Wellness
  - Dining
  - Entertainment
  - Family
  - Fashion
  - Transport
  - Travel
  - Others (uncapped)

**User Actions:**
1. Select which 2 categories get the subcap benefit (e.g., Dining + Transport)
2. Select a default category for unmapped merchants

**What Happens:**
- Settings are saved automatically to browser storage
- Totals recalculate immediately
- Changes persist across sessions

#### Middle Section: Current Month Summary
- Shows spending totals for the current statement month
- Breakdown by category
- Updates live as you categorize merchants

#### Bottom Section: Merchant Categorization

**Three Subsections:**

##### A. Transactions to Categorize (Uncategorized Merchants)
- Lists all merchants that haven't been mapped to a category
- Sorted by frequency (most common first)
- Each merchant has a dropdown to select category

**User Actions:**
1. Find a merchant in the list
2. Select a category from the dropdown
3. Changes save automatically
4. Or use "Categorize all as default" button to bulk-assign

##### B. Add Wildcard Pattern (NEW in v0.6.0)
- Manually create wildcard rules for merchants
- Useful for chains with varying names

**User Actions:**
1. Enter a pattern (e.g., `STARBUCKS*`, `*GRAB*`, `FAIRPRICE*`)
2. Select a category from dropdown
3. Click "Add" button

**Pattern Syntax:**
- `*` matches any sequence of characters
- Case-insensitive matching
- Examples:
  - `STARBUCKS*` → matches "STARBUCKS SINGAPORE", "STARBUCKS ORCHARD"
  - `*GRAB*` → matches "GRAB SINGAPORE", "GRABTAXI", "MY GRAB RIDE"
  - `FAIRPRICE*XTRA` → matches "FAIRPRICE XTRA JURONG"

**Success Feedback:**
- Green checkmark message: "✓ Added: PATTERN → Category"
- Pattern immediately applies to all matching merchants

**Error Handling:**
- Red error message if pattern is empty
- Confirmation if pattern already exists (overwrite option)

##### C. Categorized Merchants
- Shows all previously mapped merchants
- Alphabetically sorted
- Can change category assignments

### 1.4 Matching Priority & Logic

When a transaction appears, the script resolves its category using this priority:

1. **Exact match** (case-sensitive) - fastest
   - Direct merchant name match
   
2. **Case-insensitive exact match**
   - Same merchant name, different case
   
3. **Wildcard pattern match**
   - First matching pattern wins (order matters)
   
4. **Default category**
   - Falls back to your selected default (usually "Others")

**Example Flow:**
```
Transaction: "STARBUCKS TAMPINES"

1. Check exact: "STARBUCKS TAMPINES" → not found
2. Check case-insensitive: "starbucks tampines" → not found
3. Check wildcards:
   - "STARBUCKS*" → MATCH! → Category: Dining
```

### 1.5 Data Persistence

**What's Stored Locally:**
- Merchant → Category mappings (including wildcard patterns)
- Selected subcap slots
- Default category
- Transaction data (last 3 months only)

**Storage Location:**
- Tampermonkey's `GM_getValue/GM_setValue` (preferred)
- Fallback to browser's `localStorage`

**Privacy:**
- Data never leaves your browser (unless you enable sync)
- No tracking or analytics
- No remote logging

---

## 2. Sync Flow: Cross-Device Synchronization

### 2.1 Sync Setup (First-Time)

**Prerequisites:**
- Userscript installed
- Access to the Subcap Tools panel
- Optional: Self-hosted sync server (or use placeholder URL)

**User Action:** Click the "Sync" tab

**Initial State (Sync Disabled):**

You see:
- Explanation of sync benefits
- Privacy assurance box:
  - ✅ All data encrypted before leaving browser
  - ✅ Only settings/mappings synced (not raw transactions)
  - ✅ Raw transactions stay local
- **"Setup Sync"** button

**User Action:** Click "Setup Sync"

**Setup Wizard Appears:**

#### Step 1: Enter Credentials
**Fields:**
1. **Email** - Your identifier (used for account)
2. **Passphrase** - Your encryption key (NEVER sent to server)
3. **Device Name** - Human-readable name (e.g., "Work Laptop", "Home PC")

**Important Security Notes:**
- Passphrase is used to encrypt data locally
- Only a *hash* of the passphrase is sent to server (for authentication)
- Server cannot decrypt your data (true end-to-end encryption)
- If you lose your passphrase, data cannot be recovered

**User Action:** Fill form and submit

**What Happens:**
1. Script attempts login with your credentials
   - If account exists: Logs in
   - If account doesn't exist: Automatically registers new account
2. Device is registered with the sync server
3. Encryption keys are derived from your passphrase
4. Initial sync is performed
5. Success message appears

### 2.2 Sync Status (Active Sync)

**After Setup, Sync Tab Shows:**

**Status Panel:**
- ☁️ Status: Enabled
- Device: [Your device name]
- Last Sync: [Timestamp]
- Tier: free/paid
- Share Mappings: Yes/No

**Action Buttons:**
- **Manual Sync** - Force sync now
- **Disable Sync** - Turn off sync and clear config

### 2.3 Automatic Sync Triggers

**Sync Happens Automatically When:**
1. You close the Subcap Tools panel (if changes were made)
2. You add/modify merchant mappings
3. You change category selections
4. Periodically in background (if implemented)

**What Gets Synced:**
- Selected subcap categories
- Default category setting
- All merchant mappings (including wildcard patterns)

**What NEVER Gets Synced:**
- Raw transaction data
- Bank credentials
- Session tokens
- Personal browsing data

### 2.4 Sync Conflict Resolution

**Scenario:** You modify settings on multiple devices

**Conflict Strategy:** Last-write-wins
- Most recent change overwrites older changes
- No manual conflict resolution UI (limitation noted in docs)

**User Experience:**
- Changes from your most recent edit take precedence
- Earlier changes from other devices may be overwritten
- No data loss - just the most recent state wins

### 2.5 Using Sync on Additional Devices

**On a new device:**
1. Install Tampermonkey + userscript
2. Open Subcap Tools → Sync tab
3. Click "Setup Sync"
4. Enter same email + passphrase + new device name
5. Existing settings download and decrypt automatically
6. Both devices now stay in sync

### 2.6 Disabling Sync

**User Action:** Click "Disable Sync" in Sync tab

**Confirmation Dialog Appears:**
- "Are you sure you want to disable sync?"
- Explains that local data is preserved

**If Confirmed:**
- Sync configuration is cleared
- Local data remains untouched
- Device registration removed from server
- Can re-enable sync later with same credentials

---

## 3. Shared Mappings Flow (Community Feature)

### 3.1 Contributing Merchant Mappings

**How It Works:**

**For Free Tier Users (Default Behavior):**
- When you map a merchant to a category
- On closing the Subcap Tools panel
- Mapping is uploaded to shared pool
- Requires admin approval before appearing to others

**For Paid Tier Users:**
- Can opt-out of sharing via settings toggle
- "Share my merchant mappings": Yes/No

**User Experience:**
- Happens silently in background
- No interruption to your workflow
- Privacy preserved (no personal transaction details shared)

**What Gets Shared:**
- Merchant name pattern
- Category mapping
- Card type

**What's NOT Shared:**
- Your transaction amounts
- Transaction dates
- Personal information

### 3.2 Receiving Suggested Mappings

**Scenario:** You encounter a new merchant

**What Happens:**
1. Script checks local mappings: not found
2. Script queries server for approved shared mappings
3. If match found: Suggestion appears
4. You can accept or choose different category

**Example:**
```
New transaction: "STARBUCKS JURONG"

System: "Other users mapped STARBUCKS* to 'Dining'. 
        Apply this mapping? [Yes] [No, choose category]"
```

### 3.3 Admin Approval Flow

**Admin Role:**
- Reviews contributed mappings
- Approves quality mappings
- Rejects spam or inappropriate mappings

**Admin Actions:**
1. Access `/admin/mappings/pending` endpoint
2. Review pending contributions
3. Approve or reject each mapping
4. Approved mappings become available to all users

---

## 4. Data Management Flows

### 4.1 Data Export

**User Action:** (Via API or future UI)
- Call `/user/export` endpoint with auth token

**What You Get:**
- JSON file with all your data:
  - Account information
  - Device registrations
  - Sync history
  - Contributed mappings
  - Settings

**Use Cases:**
- Personal backup
- Account portability
- Audit your data

### 4.2 Data Deletion

**User Action:** (Via API or future UI)
- Call `/user/data` DELETE endpoint with auth token

**What Happens:**
1. Confirmation required (safety check)
2. All user data deleted from server:
   - Account record
   - Device registrations
   - Sync data
   - Contributed mappings
   - Audit logs (redacted)
3. Cannot be undone

**Local Data:**
- Remains on your devices
- You can continue using the script locally
- Can re-register for sync if desired

### 4.3 Settings Management

**User Action:** Update account settings via API

**Available Settings:**
- Tier upgrade (free → paid)
- Email address change
- Share mappings toggle

---

## 5. Troubleshooting Flows

### 5.1 Script Not Appearing

**Symptoms:**
- "Subcap Tools" button doesn't appear
- Script seems inactive

**Troubleshooting Steps:**
1. Verify you're on correct page: `https://pib.uob.com.sg/PIBCust/2FA/processSubmit.do*`
2. Check Tampermonkey is enabled
3. Verify script is active in Tampermonkey dashboard
4. Check browser console for errors
5. Ensure you're viewing Lady's Solitaire card transactions

### 5.2 Wrong Totals / Missing Transactions

**Symptoms:**
- Numbers don't match bank statement
- Some transactions missing

**Troubleshooting Steps:**
1. Open Manage Transactions tab
2. Check "Data issues" section (appears if there are problems)
3. Look for:
   - "Rows with unreadable posting dates" - date format issue
   - "Rows with unreadable amounts" - amount parsing issue
   - "Rows skipped" - missing data cells

**Causes:**
- UOB changed their HTML structure
- Transactions in unexpected format
- XPath selectors need updating

**Solution:**
- Report issue to maintainer
- Check TECHNICAL.md for XPath selector updates

### 5.3 Sync Not Working

**Symptoms:**
- Changes not syncing across devices
- Sync errors

**Troubleshooting Steps:**
1. Check Sync tab status
2. Verify server URL is correct (not placeholder)
3. Try manual sync
4. Check browser console for error messages
5. Verify internet connectivity
6. Check if sync server is online

**Common Issues:**
- Using placeholder server URL (won't work)
- Need to deploy your own sync backend
- Firewall blocking sync requests

### 5.4 Wildcard Pattern Not Matching

**Symptoms:**
- Pattern created but transactions not categorized

**Troubleshooting Steps:**
1. Verify pattern syntax (use `*` not regex)
2. Check for typos in pattern
3. Remember matching is case-insensitive
4. Check matching priority (exact match overrides wildcard)

**Example Debug:**
```
Pattern: STARBUCK*  (missing S)
Transaction: STARBUCKS SINGAPORE
Result: NO MATCH ❌

Fix: STARBUCKS*
Result: MATCH ✅
```

---

## 6. Advanced Flows

### 6.1 Self-Hosting Sync Backend

**For Technical Users:**

**Why Self-Host:**
- Full control over your data
- No reliance on third-party servers
- Customize functionality

**Deployment Options:**
1. **Docker** (easiest)
   - One-command deployment
   - Includes database
   
2. **Cloudflare Workers** (serverless)
   - Scalable
   - Low cost
   - Global edge deployment

**Setup Flow:**
1. Clone repository
2. Choose deployment method (Docker or Workers)
3. Generate secure secrets (`openssl rand -base64 32`)
4. Configure environment variables
5. Deploy
6. Update userscript config with your server URL
7. Rebuild userscript

**See:** `apps/backend/README.md` and `apps/backend/DEPLOYMENT.md` for details

### 6.2 Extending to Other Cards

**For Developers:**

**To Add a New Card:**
1. Update `CARD_CONFIGS` in source code
2. Add card-specific categories
3. Set subcap slot count
4. Update `TARGET_CARD_NAME` match logic
5. Rebuild userscript

**Example:**
```javascript
const CARD_CONFIGS = {
  "LADY'S SOLITAIRE CARD": {
    categories: ['Dining', 'Transport', ...],
    subcapSlots: 2
  },
  "NEW CARD NAME": {
    categories: ['Shopping', 'Travel', ...],
    subcapSlots: 3
  }
};
```

---

## 7. Privacy & Security Flows

### 7.1 Data Privacy

**What the Script Can Access:**
- ✅ Credit card transaction list (on-screen only)
- ✅ Transaction amounts, dates, merchant names
- ❌ Card numbers
- ❌ CVV/security codes
- ❌ Login credentials
- ❌ Other bank accounts

**Script Permissions:**
- Read-only access to page content
- Local storage access (browser storage)
- Network access (only for sync, if enabled)

**Your Privacy Rights:**
- View all stored data (in browser DevTools → Application → Storage)
- Delete local data anytime
- Export sync data from server
- Delete sync account completely

### 7.2 Security Best Practices

**For Users:**
1. Use strong passphrase for sync (12+ characters)
2. Don't share your passphrase
3. Review merchant mappings before sharing
4. Use script only on personal devices
5. Log out of bank after use

**For Self-Hosters:**
1. Generate strong secrets (32+ characters)
2. Enable HTTPS/TLS
3. Keep secrets secure (use secrets manager)
4. Regularly update dependencies
5. Monitor audit logs
6. Rotate secrets periodically

---

## 8. Summary of User Capabilities

### What Users Can Do:

**Transaction Management:**
- ✅ View spending by category
- ✅ Track subcap limits (2 categories for Lady's Solitaire)
- ✅ See cap warnings (approaching/exceeded)
- ✅ View monthly spending history (3 months)

**Categorization:**
- ✅ Map merchants to categories manually
- ✅ Create wildcard patterns for automatic categorization
- ✅ Bulk-categorize all uncategorized merchants
- ✅ Change category assignments anytime

**Sync (Optional):**
- ✅ Sync settings across devices
- ✅ End-to-end encrypted sync
- ✅ Share merchant mappings with community (opt-in)
- ✅ Receive suggested mappings from community

**Data Control:**
- ✅ All data stored locally by default
- ✅ Export data from sync server
- ✅ Delete sync account completely
- ✅ Disable sync while keeping local data

**Privacy:**
- ✅ No tracking or analytics
- ✅ Raw transactions never leave browser
- ✅ Open source (audit the code)
- ✅ Self-hosting option available

### What Users Cannot Do:

**Limitations:**
- ❌ Modify transactions (read-only)
- ❌ Submit forms or trigger bank actions
- ❌ Access other cards (only Lady's Solitaire)
- ❌ Work offline (requires bank page to be loaded)
- ❌ Recover lost passphrase (encryption key)
- ❌ Manually resolve sync conflicts (last-write-wins)

---

## 9. Quick Reference

### Common Tasks

| Task | Steps |
|------|-------|
| **View spending** | Click "Subcap Tools" → "Spend Totals" tab |
| **Categorize merchant** | "Manage Transactions" → Find merchant → Select category |
| **Add wildcard pattern** | "Manage Transactions" → "Add Wildcard Pattern" → Enter pattern → Select category → Add |
| **Setup sync** | "Sync" tab → "Setup Sync" → Enter credentials |
| **Manual sync** | "Sync" tab → "Manual Sync" button |
| **Change subcap slots** | "Manage Transactions" → Top dropdowns → Select 2 categories |
| **View transaction details** | "Spend Totals" → Click category name → Expands list |
| **Disable sync** | "Sync" tab → "Disable Sync" button |

### Keyboard Shortcuts

Currently none - all interactions via mouse/touch.

### Browser Compatibility

- ✅ Chrome/Chromium
- ✅ Firefox
- ✅ Edge
- ✅ Safari (with Tampermonkey)
- ❌ Mobile browsers (Tampermonkey support limited)

---

## 10. Getting Help

**Documentation:**
- `README.md` - Overview and quick start
- `TECHNICAL.md` - Technical details and selectors
- `apps/userscripts/uob-lady-solitaire/README.md` - Userscript details
- `apps/backend/README.md` - Sync backend setup
- `apps/backend/DEPLOYMENT.md` - Deployment guide

**Troubleshooting:**
- Check browser console for errors
- Review "Data issues" section in UI
- Verify page URL matches pattern
- Check Tampermonkey is enabled

**Support:**
- GitHub Issues (report bugs/feature requests)
- Code is open source (audit/contribute)

---

**Last Updated:** 2026-01-31  
**Version:** 0.6.0
