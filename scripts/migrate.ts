import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const databasePath = process.env.DATABASE_URL ?? path.join(process.cwd(), "data", "trade-journal.db");
fs.mkdirSync(path.dirname(databasePath), { recursive: true });
const database = new Database(databasePath);
database.pragma("journal_mode = WAL");
database.pragma("foreign_keys = ON");
const migrationsDirectory = path.join(process.cwd(), "drizzle");
for (const filename of fs.readdirSync(migrationsDirectory).filter((item) => item.endsWith(".sql")).sort()) {
  database.exec(fs.readFileSync(path.join(migrationsDirectory, filename), "utf8"));
}
const tradeColumns = database.prepare("PRAGMA table_info(trades)").all() as Array<{ name: string }>;
if (!tradeColumns.some((column) => column.name === "estimated_exit_fee")) {
  database.exec("ALTER TABLE trades ADD COLUMN estimated_exit_fee TEXT NOT NULL DEFAULT '0'");
}
const instrumentColumns = database.prepare("PRAGMA table_info(instruments)").all() as Array<{ name: string }>;
const addInstrumentColumn = (name: string, definition: string) => {
  if (!instrumentColumns.some((column) => column.name === name)) database.exec(`ALTER TABLE instruments ADD COLUMN ${name} ${definition}`);
};
addInstrumentColumn("price_adjustment", "TEXT NOT NULL DEFAULT 'splits'");
addInstrumentColumn("market_data_stale", "INTEGER NOT NULL DEFAULT 0");
addInstrumentColumn("last_market_refresh_at", "TEXT");
addInstrumentColumn("exit_fee_rate_pct", "TEXT NOT NULL DEFAULT '0'");
addInstrumentColumn("exit_fee_fixed", "TEXT NOT NULL DEFAULT '0'");
addInstrumentColumn("exit_fee_minimum", "TEXT NOT NULL DEFAULT '0'");
const candleColumns = database.prepare("PRAGMA table_info(candles)").all() as Array<{ name: string }>;
if (!candleColumns.some((column) => column.name === "series_id")) {
  database.exec("ALTER TABLE candles ADD COLUMN series_id INTEGER REFERENCES market_data_series(id) ON DELETE CASCADE");
}
const seriesColumns = database.prepare("PRAGMA table_info(market_data_series)").all() as Array<{ name: string }>;
if (!seriesColumns.some((column) => column.name === "last_reconciled_at")) {
  database.exec("ALTER TABLE market_data_series ADD COLUMN last_reconciled_at TEXT");
}

// Preserve the semantics of existing real data: Twelve Data daily bars are split-adjusted
// by default, while the EODHD endpoint previously used here returned raw OHLC.
database.exec("UPDATE candles SET adjustment='splits' WHERE source='twelve-data' AND adjustment='raw'");
database.exec("UPDATE instruments SET price_adjustment='raw' WHERE data_provider='eodhd' AND last_market_refresh_at IS NULL");
database.exec("UPDATE instruments SET price_adjustment='raw' WHERE data_provider IN ('csv','mock') AND last_market_refresh_at IS NULL");
database.exec("UPDATE instruments SET last_market_refresh_at=(SELECT MAX(updated_at) FROM candles WHERE candles.instrument_id=instruments.id) WHERE last_market_refresh_at IS NULL");

const migrateMarketSeries = database.transaction(() => {
  const instruments = database.prepare(`
    SELECT id, data_provider AS provider, provider_symbol AS providerSymbol,
      price_adjustment AS adjustment, currency, exchange, timezone
    FROM instruments
  `).all() as Array<{ id: number; provider: string; providerSymbol: string; adjustment: string; currency: string; exchange: string; timezone: string }>;
  const insertSeries = database.prepare(`
    INSERT OR IGNORE INTO market_data_series(
      instrument_id,provider,provider_symbol,interval,adjustment,currency,exchange,timezone,is_active,status
    ) VALUES (?,?,?,'1day',?,?,?,?,1,'EMPTY')
  `);
  const findSeries = database.prepare(`
    SELECT id FROM market_data_series
    WHERE instrument_id=? AND provider=? AND provider_symbol=? AND interval='1day' AND adjustment=?
  `);
  const attachCandles = database.prepare("UPDATE candles SET series_id=? WHERE instrument_id=? AND series_id IS NULL");
  const updateStats = database.prepare(`
    UPDATE market_data_series SET
      earliest_date=(SELECT MIN(timestamp) FROM candles WHERE series_id=market_data_series.id),
      latest_date=(SELECT MAX(timestamp) FROM candles WHERE series_id=market_data_series.id),
      candle_count=(SELECT COUNT(*) FROM candles WHERE series_id=market_data_series.id),
      status=CASE WHEN EXISTS(SELECT 1 FROM candles WHERE series_id=market_data_series.id) THEN 'HEALTHY' ELSE 'EMPTY' END,
      updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `);

  for (const instrument of instruments) {
    insertSeries.run(instrument.id, instrument.provider, instrument.providerSymbol, instrument.adjustment, instrument.currency, instrument.exchange, instrument.timezone);
    const series = findSeries.get(instrument.id, instrument.provider, instrument.providerSymbol, instrument.adjustment) as { id: number };
    attachCandles.run(series.id, instrument.id);
    updateStats.run(series.id);
  }

  database.exec("DROP INDEX IF EXISTS candles_instrument_interval_timestamp_adjustment");
  database.exec("CREATE UNIQUE INDEX IF NOT EXISTS candles_series_timestamp ON candles(series_id,timestamp)");
});
migrateMarketSeries();
database.close();
console.log(`Database ready: ${databasePath}`);
