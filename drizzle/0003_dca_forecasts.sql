CREATE TABLE IF NOT EXISTS dca_forecast_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instrument_id INTEGER NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL,
  cohort_month TEXT NOT NULL,
  anchor_date TEXT NOT NULL,
  source_trade_ids TEXT NOT NULL,
  algorithm_version TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  series_id INTEGER REFERENCES market_data_series(id) ON DELETE SET NULL,
  adjustment TEXT NOT NULL,
  data_cutoff_date TEXT,
  quantity TEXT NOT NULL,
  average_entry_price TEXT NOT NULL,
  invested_amount TEXT NOT NULL,
  buy_fees TEXT NOT NULL,
  exit_fee_model TEXT NOT NULL,
  features TEXT,
  sample_count INTEGER NOT NULL DEFAULT 0,
  confidence TEXT NOT NULL DEFAULT 'insufficient',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS dca_forecast_runs_cohort
ON dca_forecast_runs(instrument_id,account_id,cohort_month,created_at);

CREATE INDEX IF NOT EXISTS dca_forecast_runs_input
ON dca_forecast_runs(input_hash,algorithm_version);

CREATE TABLE IF NOT EXISTS dca_forecast_points (
  run_id INTEGER NOT NULL REFERENCES dca_forecast_runs(id) ON DELETE CASCADE,
  horizon INTEGER NOT NULL,
  p20 REAL NOT NULL,
  p50 REAL NOT NULL,
  p80 REAL NOT NULL,
  baseline_p50 REAL NOT NULL,
  PRIMARY KEY(run_id,horizon)
);
