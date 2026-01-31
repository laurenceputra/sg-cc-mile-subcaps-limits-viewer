/**
 * @typedef {Object} CardConfig
 * @property {string[]} categories - Available categories for this card
 * @property {number} subcapSlots - Number of subcap slots available
 */

/**
 * @typedef {Object} Transaction
 * @property {string} id - Unique transaction ID
 * @property {string} date - Transaction date (ISO 8601)
 * @property {string} merchant - Merchant name
 * @property {number} amount - Transaction amount
 * @property {string} category - Assigned category
 * @property {string} postingDate - Posting date (ISO 8601)
 */

/**
 * @typedef {Object} CardSettings
 * @property {string[]} selectedCategories - Selected subcap categories
 * @property {string} defaultCategory - Default category for unmapped transactions
 * @property {Object.<string, string>} merchantMap - Merchant to category mappings
 * @property {Object.<string, MonthlyTotal>} monthlyTotals - Monthly spending totals by category
 */

/**
 * @typedef {Object} MonthlyTotal
 * @property {Object.<string, number>} categories - Category to amount mapping for a specific month
 */

/**
 * @typedef {Object} SyncPayload
 * @property {number} version - Optimistic lock version
 * @property {string} deviceId - Device identifier
 * @property {number} timestamp - Unix timestamp
 * @property {SyncData} data - Encrypted sync data
 */

/**
 * @typedef {Object} SyncData
 * @property {Object.<string, CardSettings>} cards - Card settings by card name
 */

/**
 * @typedef {Object} SharedMerchantMapping
 * @property {string} merchant - Normalized merchant name
 * @property {string} suggestedCategory - Admin-approved category
 * @property {number} contributionCount - Number of users who contributed this mapping
 * @property {number} lastUpdated - Unix timestamp
 * @property {string} cardType - Card type/name
 */

/**
 * @typedef {Object} UserSettings
 * @property {Object.<string, CardSettings>} cards - Settings per card
 * @property {SyncConfig} [sync] - Sync configuration (optional)
 */

/**
 * @typedef {Object} SyncConfig
 * @property {boolean} enabled - Whether sync is enabled
 * @property {string} serverUrl - Sync server URL
 * @property {string} deviceId - Current device ID
 * @property {string} deviceName - Current device name
 * @property {boolean} shareMappings - Whether to share merchant mappings
 * @property {number} lastSync - Last sync timestamp
 */

export {};
