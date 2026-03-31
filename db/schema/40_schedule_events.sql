CREATE TABLE IF NOT EXISTS schedule_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  party_id INTEGER NOT NULL,
  creator_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  proposed_start_at TEXT NOT NULL,
  proposed_end_at TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Bangkok',
  vote_deadline_at TEXT,
  status TEXT NOT NULL DEFAULT 'voting' CHECK (
    status IN ('voting', 'locked', 'cancelled', 'expired')
  ),
  source_channel_id TEXT,
  vote_message_id TEXT,
  board_channel_id TEXT,
  board_message_id TEXT,
  locked_at TEXT,
  cancelled_at TEXT,
  cancelled_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_schedule_events_party_status
  ON schedule_events (party_id, status);
