ALTER TABLE parties
ADD COLUMN party_type TEXT NOT NULL DEFAULT 'ad_hoc' CHECK (
  party_type IN ('static', 'ad_hoc')
);
