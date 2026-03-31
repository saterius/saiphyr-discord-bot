CREATE TABLE IF NOT EXISTS guild_schedule_configs (
  guild_id TEXT PRIMARY KEY,
  board_channel_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_guild_schedule_configs_board_channel
  ON guild_schedule_configs (board_channel_id);
