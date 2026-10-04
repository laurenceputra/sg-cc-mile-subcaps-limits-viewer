# User Flow Diagrams

This document provides visual representations of the main user flows in the Bank CC Limits Subcap Calculator.

## Flow 1: First-Time User Setup

```
┌─────────────────────────────────────────────────────────────────┐
│                    FIRST-TIME USER SETUP                         │
└─────────────────────────────────────────────────────────────────┘

1. User installs Tampermonkey
         ↓
2. User adds userscript
         ↓
3. User logs in on UOB PIB `/auth`, navigates to `/accountsDashboard`, then opens supported card details on `/accountDetail` (same-URL DOM lifecycle changes are also supported)
         ↓
4. Script detects page → Adds "Subcap Tools" button
         ↓
5. User clicks "Subcap Tools"
         ↓
    ┌────────────────────────────────────────┐
    │     Panel Opens (3 tabs visible)       │
    ├────────────────────────────────────────┤
    │  [Spend Totals] [Manage] [Sync]        │
    │                                        │
    │  Shows "Spend Totals" by default       │
    │  - Monthly cards with totals           │
    │  - All transactions in "Others"        │
    │    (not yet categorized)               │
    └────────────────────────────────────────┘
         ↓
6. User switches to "Manage Transactions" tab
         ↓
7. User configures:
   - Selects 2 subcap categories
   - Sets default category
   - Categorizes merchants OR adds wildcard patterns
         ↓
8. User closes panel → Settings saved locally
         ↓
9. Next time: Transactions auto-categorized!
```

## Flow 2: Daily Usage (Viewing Spending)

```
┌─────────────────────────────────────────────────────────────────┐
│                    DAILY SPENDING CHECK                          │
└─────────────────────────────────────────────────────────────────┘

1. User opens UOB PIB card details on `/accountDetail` from `/accountsDashboard` or directly; persistent discovery waits for the visible supported heading and associated transaction table
         ↓
2. Clicks "Subcap Tools" button
         ↓
    ┌─────────────────────────────────────────────────┐
    │           Spend Totals Tab (Default)            │
    ├─────────────────────────────────────────────────┤
    │                                                 │
    │  ┌──────────────────────────────────────┐      │
    │  │  January 2026        $2,345.67       │      │
    │  ├──────────────────────────────────────┤      │
    │  │  ⚡ Dining:          $690.50          │◄─── Approaching cap
    │  │     Transport:       $345.20          │      │
    │  │     Others:          $1,309.97        │      │
    │  └──────────────────────────────────────┘      │
    │                                                 │
    │  ┌──────────────────────────────────────┐      │
    │  │  December 2025       $1,890.23       │      │
    │  ├──────────────────────────────────────┤      │
    │  │  🔴 Dining:          $823.40          │◄─── Exceeded cap!
    │  │     Transport:       $567.83          │      │
    │  │     Others:          $499.00          │      │
    │  └──────────────────────────────────────┘      │
    │                                                 │
    └─────────────────────────────────────────────────┘
         ↓
3. User clicks "Dining" to see details
         ↓
    ┌─────────────────────────────────────────┐
    │  Dining Transactions (Expanded)         │
    ├─────────────────────────────────────────┤
    │  Merchant            Date      Amount   │
    │  STARBUCKS SG       Jan 28    $8.50    │
    │  MCDONALDS          Jan 27    $12.30   │
    │  GRAB FOOD          Jan 26    $25.40   │
    │  ...                                    │
    └─────────────────────────────────────────┘
         ↓
4. User reviews spending → Closes panel
```

## Flow 3: Categorizing a New Merchant

```
┌─────────────────────────────────────────────────────────────────┐
│                 CATEGORIZING NEW MERCHANT                        │
└─────────────────────────────────────────────────────────────────┘

Scenario: User made transaction at "COLD STORAGE JURONG"

1. User opens Subcap Tools
         ↓
2. Goes to "Manage Transactions" tab
         ↓
    ┌──────────────────────────────────────────────┐
    │  Transactions to categorize                  │
    ├──────────────────────────────────────────────┤
    │                                              │
    │  COLD STORAGE JURONG    [Select category ▼] │◄─── New merchant
    │  GRAB SINGAPORE         [Select category ▼] │
    │                                              │
    └──────────────────────────────────────────────┘
         ↓
3. User clicks dropdown → Selects "Others"
         ↓
    ┌──────────────────────────────────────────────┐
    │  COLD STORAGE JURONG    [Others          ▼] │◄─── Selected
    └──────────────────────────────────────────────┘
         ↓
4. Mapping saved automatically
         ↓
5. Transaction now appears under "Others" in Spend Totals
         ↓
6. Future "COLD STORAGE JURONG" transactions auto-categorized
```

## Flow 4: Creating Wildcard Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│                  WILDCARD PATTERN CREATION                       │
└─────────────────────────────────────────────────────────────────┘

Scenario: User wants all Starbucks locations → Dining

1. User opens "Manage Transactions" tab
         ↓
2. Scrolls to "Add Wildcard Pattern" section
         ↓
    ┌────────────────────────────────────────────────────┐
    │         Add Wildcard Pattern                       │
    ├────────────────────────────────────────────────────┤
    │  Use * to match any characters                     │
    │  Example: STARBUCKS* matches all Starbucks         │
    │                                                    │
    │  Pattern: [________________] Category: [_____▼] [Add] │
    └────────────────────────────────────────────────────┘
         ↓
3. User types: STARBUCKS*
         ↓
4. User selects: Dining
         ↓
    ┌────────────────────────────────────────────────────┐
    │  Pattern: [STARBUCKS*      ] Category: [Dining ▼] [Add] │
    └────────────────────────────────────────────────────┘
         ↓
5. User clicks "Add"
         ↓
    ┌────────────────────────────────────────────────────┐
    │  ✓ Added: STARBUCKS* → Dining                      │◄─── Success
    └────────────────────────────────────────────────────┘
         ↓
6. Pattern now matches:
   - STARBUCKS SINGAPORE → Dining ✓
   - STARBUCKS ORCHARD → Dining ✓
   - STARBUCKS TAMPINES → Dining ✓
   - Any future Starbucks location → Dining ✓
```

## Flow 5: Sync Setup (Cross-Device)

```
┌─────────────────────────────────────────────────────────────────┐
│                      SYNC SETUP FLOW                             │
└─────────────────────────────────────────────────────────────────┘

Device A (First Device)
───────────────────────

1. User clicks "Sync" tab
         ↓
    ┌────────────────────────────────────────┐
    │  Sync Settings                         │
    ├────────────────────────────────────────┤
    │  Enable sync to access settings        │
    │  across devices.                       │
    │                                        │
    │  Privacy First:                        │
    │  ✓ All data encrypted                  │
    │  ✓ Only settings synced                │
    │  ✓ Raw transactions stay local         │
    │                                        │
    │        [Setup Sync]                    │
    └────────────────────────────────────────┘
         ↓
2. User clicks "Setup Sync"
         ↓
    ┌────────────────────────────────────────┐
    │  Setup Sync                            │
    ├────────────────────────────────────────┤
    │  Email:      [user@example.com     ]   │
    │  Passphrase: [****************     ]   │
    │  Device:     [Work Laptop          ]   │
    │                                        │
    │         [Cancel] [Setup]               │
    └────────────────────────────────────────┘
         ↓
3. User fills form → Clicks "Setup"
         ↓
4. Script does:
   - Derives encryption key from passphrase
   - Hashes passphrase for authentication
   - Tries login (creates account if new)
   - Registers device
   - Uploads encrypted settings
         ↓
    ┌────────────────────────────────────────┐
    │  ✓ Sync enabled successfully!          │
    │                                        │
    │  Status:      ☁️ Enabled               │
    │  Device:      Work Laptop              │
    │  Last Sync:   Just now                 │
    │  Tier:        free                     │
    └────────────────────────────────────────┘

Device B (Second Device)
────────────────────────

5. User installs script on Device B
         ↓
6. Opens "Sync" tab → "Setup Sync"
         ↓
7. Enters SAME email + passphrase + different device name
         ↓
    ┌────────────────────────────────────────┐
    │  Email:      [user@example.com     ]   │
    │  Passphrase: [****************     ]   │
    │  Device:     [Home PC              ]   │◄─── Different name
    └────────────────────────────────────────┘
         ↓
8. Script does:
   - Logs in with existing account
   - Downloads encrypted settings
   - Decrypts locally with passphrase
   - Applies settings
         ↓
9. All merchant mappings now on Device B!
         ↓
10. Changes on either device sync automatically
```

## Flow 6: Merchant Matching Logic

```
┌─────────────────────────────────────────────────────────────────┐
│                 MERCHANT MATCHING DECISION TREE                  │
└─────────────────────────────────────────────────────────────────┘

New Transaction: "STARBUCKS TAMPINES"
         ↓
    ┌────────────────────────────────────┐
    │  Check 1: Exact Match              │
    │  (case-sensitive)                  │
    └────────────────────────────────────┘
         ↓
    Is "STARBUCKS TAMPINES" in mappings?
         ↓
        NO
         ↓
    ┌────────────────────────────────────┐
    │  Check 2: Case-Insensitive Match   │
    └────────────────────────────────────┘
         ↓
    Is "starbucks tampines" match (any case)?
         ↓
        NO
         ↓
    ┌────────────────────────────────────┐
    │  Check 3: Wildcard Patterns        │
    │  (in order of definition)          │
    └────────────────────────────────────┘
         ↓
    Pattern "STARBUCKS*" exists?
         ↓
       YES ✓
         ↓
    Does "STARBUCKS TAMPINES" match "STARBUCKS*"?
         ↓
       YES ✓ → Category: Dining
         ↓
    ┌────────────────────────────────────┐
    │  ✓ Transaction categorized!        │
    │  Merchant: STARBUCKS TAMPINES      │
    │  Category: Dining                  │
    └────────────────────────────────────┘


Alternative Path (No Match):
         ↓
    All checks fail
         ↓
    ┌────────────────────────────────────┐
    │  Use Default Category              │
    └────────────────────────────────────┘
         ↓
    Category: Others (or user's default)
```

## Flow 7: Data Privacy Model

```
┌─────────────────────────────────────────────────────────────────┐
│                    DATA PRIVACY MODEL                            │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                  USER'S BROWSER                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │  UOB Banking Page                                  │  │
│  │  ├─ Transaction: STARBUCKS SG     $8.50           │  │
│  │  ├─ Transaction: GRAB              $15.30          │  │
│  │  └─ Transaction: NTUC              $45.00          │  │
│  └────────────────────────────────────────────────────┘  │
│         ↓ (Read-Only)                                    │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Userscript Processing (IN BROWSER)               │  │
│  │  ├─ Extract merchant names                         │  │
│  │  ├─ Extract amounts                                │  │
│  │  ├─ Apply category mappings                        │  │
│  │  └─ Calculate totals                               │  │
│  └────────────────────────────────────────────────────┘  │
│         ↓                                                 │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Local Storage (STAYS IN BROWSER)                 │  │
│  │  ├─ Merchant mappings                              │  │
│  │  ├─ Category selections                            │  │
│  │  ├─ Transaction cache (3 months)                   │  │
│  │  └─ Settings                                       │  │
│  └────────────────────────────────────────────────────┘  │
│         ↓ (OPTIONAL - If sync enabled)                   │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Client-Side Encryption                           │  │
│  │  ├─ Derive key from passphrase                     │  │
│  │  ├─ Encrypt settings only (NOT transactions)       │  │
│  │  └─ Create encrypted blob                          │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
         ↓ (Encrypted data only)
         ↓ (Server CANNOT decrypt)
┌──────────────────────────────────────────────────────────┐
│               SYNC SERVER (Optional)                      │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Encrypted Storage                                 │  │
│  │  ├─ Encrypted settings blob                        │  │
│  │  ├─ Encrypted merchant mappings                    │  │
│  │  └─ Metadata (timestamps, version)                 │  │
│  │                                                    │  │
│  │  ❌ NO access to:                                  │  │
│  │     - Raw transactions                             │  │
│  │     - Transaction amounts                          │  │
│  │     - Your passphrase                              │  │
│  │     - Decrypted data                               │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘

KEY PRINCIPLE: End-to-End Encryption
- Server stores encrypted blobs
- Only your browser can decrypt (with your passphrase)
- Raw transactions NEVER leave browser
```

## Flow 8: Error Handling & Troubleshooting

```
┌─────────────────────────────────────────────────────────────────┐
│               ERROR HANDLING DECISION TREE                       │
└─────────────────────────────────────────────────────────────────┘

User Problem: "Totals don't match statement"
         ↓
    ┌──────────────────────────────────┐
    │  Check "Data Issues" section     │
    │  in Manage Transactions tab      │
    └──────────────────────────────────┘
         ↓
    ┌─────────────────────────────────────────────┐
    │  Issue Found?                               │
    └─────────────────────────────────────────────┘
         ↓
    ┌────┴────┐
    │         │
   YES       NO
    │         │
    ↓         ↓
┌─────────┐  ┌──────────────────────┐
│ Issue:  │  │  Check browser       │
│ Invalid │  │  console for errors  │
│ dates   │  └──────────────────────┘
└─────────┘         ↓
    ↓          ┌────────────────┐
┌─────────────┐│  XPath error?  │
│  UOB changed││                │
│  date format││  → Update      │
│             ││    selectors   │
│  → Report   │└────────────────┘
│    to       │
│    maintainer│
└─────────────┘


User Problem: "Script not appearing"
         ↓
    Check page URL
         ↓
    ┌──────────────────────────────────────┐
    │  URL matches pattern?                │
    │  pib.uob.com.sg/accountDetail*        │
    └──────────────────────────────────────┘
         ↓
    ┌────┴────┐
    │         │
   YES       NO
    │         │
    ↓         ↓
Check card     Wrong page
    ↓          └→ Navigate to
Card name           transactions
"LADY'S             page
SOLITAIRE"?
    │
   YES → Check Tampermonkey
    │     ↓
    │     Enabled?
    │     ↓
    │    YES → Check console
    │          for script errors


User Problem: "Sync not working"
         ↓
    ┌──────────────────────────────┐
    │  Check sync status            │
    └──────────────────────────────┘
         ↓
    Error message?
         ↓
    ┌─────────────────────────────────┐
    │  "Server not found"             │
    └─────────────────────────────────┘
         ↓
    Using placeholder URL?
         ↓
       YES → Deploy your own server
         │   OR disable sync
         ↓
    ┌─────────────────────────────────┐
    │  "Authentication failed"        │
    └─────────────────────────────────┘
         ↓
    Wrong passphrase
         ↓
    Reset: Disable sync → Re-setup
```

## Summary: Main User Journeys

### Journey A: Casual User (Local Only)
```
Install → View Spending → Categorize Merchants → Done
        ↑─────────────────────────────────────────┘
        (Repeat weekly/monthly)
```

### Journey B: Power User (With Sync)
```
Install → Setup Sync → Configure → Use on Device 2
        ↑──────────────────────────────────────┘
        (Settings sync automatically)
```

### Journey C: Community Contributor
```
Install → Setup Sync → Map Merchants → Share Mappings
                              ↓
                       Help other users
```

---

**Visual Key:**
- `→` Flow direction
- `↓` Next step
- `┌─┐` Decision/component box
- `✓` Success state
- `❌` Blocked/forbidden
- `⚡` Warning state
- `🔴` Error/critical state
- `☁️` Sync enabled
