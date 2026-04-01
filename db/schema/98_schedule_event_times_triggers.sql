CREATE TRIGGER IF NOT EXISTS trg_schedule_event_times_updated_at
AFTER UPDATE ON schedule_event_times
FOR EACH ROW
BEGIN
  UPDATE schedule_event_times
  SET updated_at = CURRENT_TIMESTAMP
  WHERE event_id = NEW.event_id;
END;
