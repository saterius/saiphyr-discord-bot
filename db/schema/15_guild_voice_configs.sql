CREATE TABLE IF NOT EXISTS guild_voice_configs (
  guild_id TEXT PRIMARY KEY,
  lobby_channel_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_guild_voice_configs_lobby_channel
  ON guild_voice_configs (lobby_channel_id);
