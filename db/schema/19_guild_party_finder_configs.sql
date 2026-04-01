CREATE TABLE IF NOT EXISTS guild_party_finder_configs (
  guild_id TEXT PRIMARY KEY,
  finder_channel_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_guild_party_finder_configs_channel
  ON guild_party_finder_configs (finder_channel_id);
