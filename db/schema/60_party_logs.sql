CREATE TABLE IF NOT EXISTS party_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  party_id INTEGER NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_user_id TEXT,
  schedule_event_id INTEGER,
  meta_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE,
  FOREIGN KEY (schedule_event_id) REFERENCES schedule_events(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_party_logs_party_created
  ON party_logs (party_id, created_at);
