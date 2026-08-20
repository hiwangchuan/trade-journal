CREATE TABLE IF NOT EXISTS market_sync_settings (
  id INTEGER PRIMARY KEY CHECK(id=1),
  auto_sync INTEGER NOT NULL DEFAULT 1,
  stale_after_hours INTEGER NOT NULL DEFAULT 18,
  reconcile_interval_days INTEGER NOT NULL DEFAULT 30,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO market_sync_settings(id,auto_sync,stale_after_hours,reconcile_interval_days)
VALUES (1,1,18,30);
