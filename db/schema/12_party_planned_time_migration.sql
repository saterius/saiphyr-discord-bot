ALTER TABLE parties
ADD COLUMN planned_start_at_unix INTEGER;

ALTER TABLE parties
ADD COLUMN planned_timezone TEXT;
