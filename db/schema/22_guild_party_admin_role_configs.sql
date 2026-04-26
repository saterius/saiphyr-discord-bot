CREATE TABLE IF NOT EXISTS guild_party_admin_role_configs (
  guild_id TEXT PRIMARY KEY,
  admin_role_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_guild_party_admin_role_configs_role
  ON guild_party_admin_role_configs (admin_role_id);
