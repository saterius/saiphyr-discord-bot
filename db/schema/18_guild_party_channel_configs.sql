CREATE TABLE IF NOT EXISTS guild_party_channel_configs (
  guild_id TEXT PRIMARY KEY,
  category_channel_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_guild_party_channel_configs_category
  ON guild_party_channel_configs (category_channel_id);
