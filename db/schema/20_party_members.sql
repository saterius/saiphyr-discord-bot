CREATE TABLE IF NOT EXISTS party_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  party_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  class_key TEXT NOT NULL,
  class_label TEXT,
  slot_number INTEGER CHECK (slot_number BETWEEN 1 AND 8),
  join_status TEXT NOT NULL DEFAULT 'joined' CHECK (
    join_status IN ('joined', 'confirmed', 'kicked', 'left')
  ),
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TEXT,
  removed_at TEXT,
  removed_by TEXT,
  removal_reason TEXT,
  UNIQUE (party_id, user_id),
  FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_party_members_party_status
  ON party_members (party_id, join_status);

CREATE INDEX IF NOT EXISTS idx_party_members_user
  ON party_members (user_id);
