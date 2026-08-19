import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const databasePath = process.env.DATABASE_URL ?? path.join(process.cwd(), "data", "trade-journal.db");
fs.mkdirSync(path.dirname(databasePath), { recursive: true });
const database = new Database(databasePath);
const sql = fs.readFileSync(path.join(process.cwd(), "drizzle", "0000_initial.sql"), "utf8");
database.exec(sql);
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

// Preserve the semantics of existing real data: Twelve Data daily bars are split-adjusted
// by default, while the EODHD endpoint previously used here returned raw OHLC.
database.exec("UPDATE candles SET adjustment='splits' WHERE source='twelve-data' AND adjustment='raw'");
database.exec("UPDATE instruments SET price_adjustment='raw' WHERE data_provider='eodhd' AND last_market_refresh_at IS NULL");
database.exec("UPDATE instruments SET price_adjustment='raw' WHERE data_provider IN ('csv','mock') AND last_market_refresh_at IS NULL");
database.exec("UPDATE instruments SET last_market_refresh_at=(SELECT MAX(updated_at) FROM candles WHERE candles.instrument_id=instruments.id) WHERE last_market_refresh_at IS NULL");
database.close();
console.log(`Database ready: ${databasePath}`);
