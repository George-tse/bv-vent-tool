-- ============================================================
-- BV Vent Survey Tool – Supabase schema  (v3 — clean rebuild)
-- Run in: Supabase Dashboard → SQL Editor → New query
-- Instance: xifeyqspfftoizobfhed.supabase.co
--
-- STEP 1 drops any leftover tables from previous attempts.
-- Safe to run even if tables don't exist yet.
-- ============================================================


-- ── Step 1: clean slate ───────────────────────────────────────────────────────

DROP VIEW  IF EXISTS v_vent_survey_summary;
DROP TABLE IF EXISTS vent_photos    CASCADE;
DROP TABLE IF EXISTS vent_defects   CASCADE;
DROP TABLE IF EXISTS vent_readings  CASCADE;
DROP TABLE IF EXISTS fan_events;
DROP TABLE IF EXISTS vent_surveys   CASCADE;


-- ── Step 2: ensure uuid extension ────────────────────────────────────────────
-- uuid-ossp is always enabled in Supabase; uuid_generate_v4() is guaranteed.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ── Step 3: create tables (fresh, no IF NOT EXISTS needed after DROP) ─────────

CREATE TABLE vent_surveys (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  local_id    TEXT        UNIQUE NOT NULL,
  survey_date DATE        NOT NULL,
  surveyor    TEXT        NOT NULL,
  weather     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vent_surveys_date ON vent_surveys(survey_date DESC);


CREATE TABLE vent_readings (
  id           UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  survey_id    UUID    NOT NULL REFERENCES vent_surveys(id) ON DELETE CASCADE,
  station_id   TEXT    NOT NULL,
  station_name TEXT,
  velocity     NUMERIC(6,2),
  csa          NUMERIC(6,2),
  csa_override NUMERIC(6,2),
  q_actual     NUMERIC(6,1),
  q_min        NUMERIC(6,1),
  pressure     NUMERIC(7,2),
  db_temp      NUMERIC(5,1),
  wb_temp      NUMERIC(5,1),
  gas_o2       NUMERIC(5,2),
  gas_co       NUMERIC(7,1),
  gas_co2      NUMERIC(7,1),
  gas_no2      NUMERIC(6,2),
  gas_h2s      NUMERIC(6,2),
  activity     TEXT,
  comments     TEXT,
  compliant    BOOLEAN,
  completed    BOOLEAN DEFAULT FALSE,
  UNIQUE (survey_id, station_id)
);


CREATE TABLE vent_defects (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  local_id       TEXT        UNIQUE,
  survey_id      UUID        NOT NULL REFERENCES vent_surveys(id)  ON DELETE CASCADE,
  reading_id     UUID                 REFERENCES vent_readings(id) ON DELETE SET NULL,
  station_name   TEXT,
  defect_type    TEXT        NOT NULL,
  priority       TEXT,
  notes          TEXT,
  assigned_to    TEXT        DEFAULT 'Barminco foreperson',
  due_by         TEXT,
  date_completed DATE,
  signed_by      TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vent_defects_survey ON vent_defects(survey_id);


CREATE TABLE vent_photos (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  local_id      TEXT        UNIQUE,
  survey_id     UUID        NOT NULL REFERENCES vent_surveys(id) ON DELETE CASCADE,
  station_id    TEXT,
  storage_path  TEXT        NOT NULL,
  original_name TEXT,
  uploaded_at   TIMESTAMPTZ DEFAULT NOW()
);


CREATE TABLE fan_events (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  local_id      TEXT        UNIQUE,
  event_date    DATE,
  event_time    TIME,
  fans_affected JSONB       DEFAULT '[]',
  cause         TEXT,
  actions_taken TEXT,
  duration      TEXT,
  resolution    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_fan_events_date ON fan_events(event_date DESC);


-- ── Step 4: useful view ───────────────────────────────────────────────────────

CREATE VIEW v_vent_survey_summary AS
SELECT
  s.id,
  s.survey_date,
  s.surveyor,
  s.weather,
  COUNT(r.id)                                      AS total_stations,
  COUNT(r.id) FILTER (WHERE r.completed)           AS completed_stations,
  COUNT(r.id) FILTER (WHERE r.compliant IS FALSE)  AS non_compliant,
  COUNT(d.id)                                      AS total_defects,
  COUNT(d.id) FILTER (WHERE d.priority LIKE 'P1%') AS p1_defects
FROM vent_surveys s
LEFT JOIN vent_readings r ON r.survey_id = s.id
LEFT JOIN vent_defects  d ON d.survey_id = s.id
GROUP BY s.id
ORDER BY s.survey_date DESC;


-- ── Done ─────────────────────────────────────────────────────────────────────
-- RLS is intentionally left DISABLED (Supabase default).
-- The anon key in the app has full read/write access without any policies.
--
-- Next: create the Storage bucket manually (see storage-policies.sql).
