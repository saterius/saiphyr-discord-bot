CREATE TRIGGER IF NOT EXISTS trg_guild_schedule_board_state_updated_at
AFTER UPDATE ON guild_schedule_board_state
FOR EACH ROW
BEGIN
  UPDATE guild_schedule_board_state
  SET updated_at = CURRENT_TIMESTAMP
  WHERE guild_id = NEW.guild_id;
END;
