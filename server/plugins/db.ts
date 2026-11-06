import { runMigrations } from "@agent-native/core/db";

export default runMigrations(
  [
    {
      version: 1,
      name: "spot-rules-core",
      sql: `CREATE TABLE IF NOT EXISTS spots (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  activity TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lon DOUBLE PRECISION NOT NULL CHECK (lon BETWEEN -180 AND 180),
  timezone TEXT,
  owner_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (now())
);
CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  spot_id TEXT NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  version INTEGER,
  body JSONB NOT NULL,
  source_text TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'archived', 'rejected')),
  created_by TEXT NOT NULL CHECK (created_by IN ('user', 'agent')),
  reason TEXT,
  feedback_id TEXT,
  owner_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (now()),
  decided_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS rules_one_active_idx ON rules (spot_id) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS rules_one_draft_idx ON rules (spot_id) WHERE status = 'draft';
CREATE UNIQUE INDEX IF NOT EXISTS rules_spot_version_idx ON rules (spot_id, version) WHERE version IS NOT NULL;
CREATE TABLE IF NOT EXISTS weather_cache (
  spot_id TEXT PRIMARY KEY REFERENCES spots(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL,
  hourly JSONB NOT NULL,
  fetched_at TEXT NOT NULL,
  owner_email TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  spot_id TEXT NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  rule_version INTEGER NOT NULL,
  user_says TEXT NOT NULL CHECK (user_says IN ('GO', 'MAYBE', 'NO')),
  reason_text TEXT NOT NULL,
  verdict JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolved_by_version INTEGER,
  owner_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (now())
);
CREATE TABLE IF NOT EXISTS spot_user_settings (
  owner_email TEXT PRIMARY KEY,
  replay_date TEXT,
  updated_at TEXT NOT NULL DEFAULT (now())
);
CREATE INDEX IF NOT EXISTS spots_owner_idx ON spots (owner_email, created_at);
CREATE INDEX IF NOT EXISTS rules_spot_idx ON rules (spot_id, status);
CREATE INDEX IF NOT EXISTS feedback_spot_idx ON feedback (spot_id, date)`,
    },
  ],
  { table: "spot_rules_migrations" },
);
