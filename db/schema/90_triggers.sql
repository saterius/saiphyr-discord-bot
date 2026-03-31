CREATE TRIGGER IF NOT EXISTS trg_parties_updated_at
AFTER UPDATE ON parties
FOR EACH ROW
BEGIN
  UPDATE parties
  SET updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_schedule_events_updated_at
AFTER UPDATE ON schedule_events
FOR EACH ROW
BEGIN
  UPDATE schedule_events
  SET updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.id;
END;
