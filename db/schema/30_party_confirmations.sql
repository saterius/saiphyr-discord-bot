CREATE TABLE IF NOT EXISTS party_confirmations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  party_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  response TEXT NOT NULL CHECK (response IN ('pending', 'accepted', 'declined')),
  responded_at TEXT,
  note TEXT,
  UNIQUE (party_id, user_id),
  FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_party_confirmations_party
  ON party_confirmations (party_id, response);
