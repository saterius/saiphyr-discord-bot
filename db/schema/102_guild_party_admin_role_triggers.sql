CREATE TRIGGER IF NOT EXISTS trg_guild_party_admin_role_configs_updated_at
AFTER UPDATE ON guild_party_admin_role_configs
FOR EACH ROW
BEGIN
  UPDATE guild_party_admin_role_configs
  SET updated_at = CURRENT_TIMESTAMP
  WHERE guild_id = NEW.guild_id;
END;
