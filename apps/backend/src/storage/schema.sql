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

-- Audit logs table for security events
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL, -- 'login_success', 'login_failed', 'device_register', 'device_remove', 'data_export', 'settings_change', 'admin_action'
  user_id INTEGER, -- NULL for failed logins where user doesn't exist
  ip_address TEXT NOT NULL,
  user_agent TEXT,
  device_id TEXT,
  details TEXT, -- JSON with sanitized event-specific details (no passwords/tokens)
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Token blacklist table for logout/revocation
CREATE TABLE IF NOT EXISTS token_blacklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_jti TEXT NOT NULL, -- JWT ID (hash of token for privacy)
  expires_at INTEGER NOT NULL, -- Token expiration timestamp
  blacklisted_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  reason TEXT, -- 'logout', 'logout_all', 'security'
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_shared_mappings_card_type ON shared_mappings(card_type);
CREATE INDEX IF NOT EXISTS idx_shared_mappings_status ON shared_mappings(status);
CREATE INDEX IF NOT EXISTS idx_mapping_contributions_user_id ON mapping_contributions(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_token_blacklist_token_jti ON token_blacklist(token_jti);
CREATE INDEX IF NOT EXISTS idx_token_blacklist_user_id ON token_blacklist(user_id);
CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires_at ON token_blacklist(expires_at);
