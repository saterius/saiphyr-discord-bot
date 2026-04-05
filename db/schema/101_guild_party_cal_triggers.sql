CREATE TRIGGER IF NOT EXISTS trg_guild_party_cal_configs_updated_at
AFTER UPDATE ON guild_party_cal_configs
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE guild_party_cal_configs
  SET updated_at = CURRENT_TIMESTAMP
  WHERE guild_id = OLD.guild_id;
END;
