CREATE TABLE IF NOT EXISTS party_calculations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  party_id INTEGER NOT NULL,
  creator_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL UNIQUE,
  amounts_text TEXT NOT NULL,
  gross_total REAL NOT NULL,
  stamp_count INTEGER NOT NULL DEFAULT 0,
  stamp_cost REAL NOT NULL DEFAULT 0,
  net_total REAL NOT NULL,
  member_count INTEGER NOT NULL,
  suggestion_sent INTEGER NOT NULL DEFAULT 0 CHECK (suggestion_sent IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (party_id) REFERENCES parties (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_party_calculations_party
  ON party_calculations (party_id, created_at DESC);
