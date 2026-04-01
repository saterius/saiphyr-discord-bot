CREATE TRIGGER IF NOT EXISTS trg_schedule_completion_prompts_updated_at
AFTER UPDATE ON schedule_completion_prompts
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE schedule_completion_prompts
  SET updated_at = CURRENT_TIMESTAMP
  WHERE event_id = NEW.event_id;
END;
