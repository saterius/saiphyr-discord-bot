CREATE TABLE IF NOT EXISTS schedule_event_times (
  event_id INTEGER PRIMARY KEY,
  start_at_unix INTEGER NOT NULL,
  end_at_unix INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES schedule_events(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_schedule_event_times_start
  ON schedule_event_times (start_at_unix);
