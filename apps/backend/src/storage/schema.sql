-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  passphrase_hash TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'free', -- 'free' or 'paid'
  share_mappings INTEGER NOT NULL DEFAULT 1, -- 1 = true, 0 = false
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Devices table
CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  device_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  last_seen INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Sync blobs table
CREATE TABLE IF NOT EXISTS sync_blobs (
  user_id INTEGER PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 0,
  encrypted_data TEXT NOT NULL, -- JSON with ciphertext, iv, salt
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Shared merchant mappings (admin-approved)
CREATE TABLE IF NOT EXISTS shared_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  merchant_normalized TEXT NOT NULL,
  suggested_category TEXT NOT NULL,
  card_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved', -- 'pending', 'approved', 'rejected'
  contribution_count INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(merchant_normalized, card_type)
);

-- Mapping contributions (for tracking)
CREATE TABLE IF NOT EXISTS mapping_contributions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  merchant_raw TEXT NOT NULL,
  category TEXT NOT NULL,
  card_type TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_shared_mappings_card_type ON shared_mappings(card_type);
CREATE INDEX IF NOT EXISTS idx_shared_mappings_status ON shared_mappings(status);
CREATE INDEX IF NOT EXISTS idx_mapping_contributions_user_id ON mapping_contributions(user_id);
