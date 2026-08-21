CREATE TABLE IF NOT EXISTS manual_level_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  manual_level_id INTEGER NOT NULL REFERENCES manual_levels(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('CREATED','UPDATED','ARCHIVED','RESTORED')),
  price REAL NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('SUPPORT','RESISTANCE','CUSTOM')),
  label TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  effective_date TEXT NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(manual_level_id, revision)
);

CREATE INDEX IF NOT EXISTS manual_level_versions_level_revision
  ON manual_level_versions(manual_level_id, revision);

INSERT OR IGNORE INTO manual_level_versions(
  manual_level_id, revision, action, price, type, label, note, effective_date, recorded_at
)
SELECT id, 1, 'CREATED', price, type, label, note,
  COALESCE(start_date, substr(created_at, 1, 10)), created_at
FROM manual_levels;
