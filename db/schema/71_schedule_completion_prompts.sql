CREATE TABLE IF NOT EXISTS schedule_completion_prompts (
  event_id INTEGER PRIMARY KEY,
  prompt_channel_id TEXT,
  prompt_message_id TEXT,
  prompted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES schedule_events(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_schedule_completion_prompts_completed_at
  ON schedule_completion_prompts (completed_at);
