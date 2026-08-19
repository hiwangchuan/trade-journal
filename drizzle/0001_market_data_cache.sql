CREATE TABLE IF NOT EXISTS market_data_series (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instrument_id INTEGER NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_symbol TEXT NOT NULL,
  interval TEXT NOT NULL DEFAULT '1day',
  adjustment TEXT NOT NULL DEFAULT 'raw' CHECK(adjustment IN ('raw','splits')),
  currency TEXT NOT NULL DEFAULT 'USD',
  exchange TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  is_active INTEGER NOT NULL DEFAULT 1,
  earliest_date TEXT,
  latest_date TEXT,
  candle_count INTEGER NOT NULL DEFAULT 0,
  data_revision INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  last_success_at TEXT,
  status TEXT NOT NULL DEFAULT 'EMPTY',
  quality_message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS market_data_series_identity ON market_data_series(instrument_id, provider, provider_symbol, interval, adjustment);
CREATE INDEX IF NOT EXISTS market_data_series_active ON market_data_series(instrument_id, is_active);

CREATE TABLE IF NOT EXISTS market_sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id INTEGER NOT NULL REFERENCES market_data_series(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'RUNNING',
  requested_from TEXT,
  requested_to TEXT,
  returned_count INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  unchanged_count INTEGER NOT NULL DEFAULT 0,
  invalid_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS market_sync_runs_series_started ON market_sync_runs(series_id, started_at);

CREATE TABLE IF NOT EXISTS corporate_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instrument_id INTEGER NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  effective_date TEXT NOT NULL,
  ratio REAL,
  cash_amount REAL,
  currency TEXT,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DETECTED',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS corporate_actions_identity ON corporate_actions(instrument_id, type, effective_date, source);
