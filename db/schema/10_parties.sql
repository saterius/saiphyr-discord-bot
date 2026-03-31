CREATE TABLE IF NOT EXISTS parties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  leader_id TEXT NOT NULL,
  recruit_channel_id TEXT,
  recruit_message_id TEXT,
  party_role_id TEXT,
  party_channel_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  max_members INTEGER NOT NULL DEFAULT 8 CHECK (max_members > 0),
  status TEXT NOT NULL DEFAULT 'recruiting' CHECK (
    status IN ('recruiting', 'pending_confirm', 'active', 'scheduled', 'closed', 'cancelled')
  ),
  auto_close_at TEXT,
  locked_at TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_parties_guild_status
  ON parties (guild_id, status);

CREATE INDEX IF NOT EXISTS idx_parties_leader
  ON parties (leader_id);
