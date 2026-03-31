CREATE TABLE IF NOT EXISTS schedule_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  vote TEXT NOT NULL CHECK (vote IN ('accept', 'deny')),
  voted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note TEXT,
  UNIQUE (event_id, user_id),
  FOREIGN KEY (event_id) REFERENCES schedule_events(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_schedule_votes_event
  ON schedule_votes (event_id, vote);
