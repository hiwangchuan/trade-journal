import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let temporaryDirectory = "";
let sqlite: import("better-sqlite3").Database;
let storage: typeof import("../src/lib/market-data/storage");

beforeAll(async () => {
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "trade-journal-storage-"));
  process.env.DATABASE_URL = path.join(temporaryDirectory, "test.db");
  const database = await import("../src/db");
  sqlite = database.sqlite;
  sqlite.exec(fs.readFileSync(path.join(process.cwd(), "drizzle", "0000_initial.sql"), "utf8"));
  sqlite.exec(fs.readFileSync(path.join(process.cwd(), "drizzle", "0001_market_data_cache.sql"), "utf8"));
  sqlite.exec(fs.readFileSync(path.join(process.cwd(), "drizzle", "0002_market_sync_settings.sql"), "utf8"));
  sqlite.exec("ALTER TABLE candles ADD COLUMN series_id INTEGER REFERENCES market_data_series(id) ON DELETE CASCADE");
  sqlite.exec("ALTER TABLE market_data_series ADD COLUMN last_reconciled_at TEXT");
  sqlite.exec("DROP INDEX IF EXISTS candles_instrument_interval_timestamp_adjustment");
  sqlite.exec("CREATE UNIQUE INDEX candles_series_timestamp ON candles(series_id,timestamp)");
  sqlite.prepare(`INSERT INTO instruments(symbol,name,exchange,market,currency,timezone,data_provider,provider_symbol,price_adjustment)
    VALUES ('QQQ','Invesco QQQ','NASDAQ','US','USD','America/New_York','twelve-data','QQQ','splits')`).run();
  storage = await import("../src/lib/market-data/storage");
});

afterAll(() => {
  sqlite.close();
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe("本地行情累计存储", () => {
  it("重复同步保持幂等，并保留接口未返回的旧K线", () => {
    const series = storage.getOrCreateConfiguredSeries(1);
    const first = storage.mergeCandles(series, [
      { time: "2026-08-17", open: 100, high: 103, low: 99, close: 102, volume: 1000, source: "twelve-data", adjustment: "splits" },
      { time: "2026-08-18", open: 102, high: 104, low: 101, close: 103, volume: 1200, source: "twelve-data", adjustment: "splits" },
    ]);
    storage.activateMarketSeries(series.id);
    expect(first).toMatchObject({ inserted: 2, updated: 0, unchanged: 0 });

    const repeated = storage.mergeCandles(series, [
      { time: "2026-08-18", open: 102, high: 104, low: 101, close: 103, volume: 1200, source: "twelve-data", adjustment: "splits" },
    ]);
    expect(repeated).toMatchObject({ inserted: 0, updated: 0, unchanged: 1 });
    expect(storage.getCandlesForActiveSeries(1).map((item) => item.time)).toEqual(["2026-08-17", "2026-08-18"]);
  });

  it("修正重叠日期而不删除其他历史", () => {
    const series = storage.getActiveMarketSeries(1)!;
    const corrected = storage.mergeCandles(series, [
      { time: "2026-08-18", open: 102, high: 105, low: 101, close: 104, volume: 1250, source: "twelve-data", adjustment: "splits" },
    ]);
    expect(corrected).toMatchObject({ inserted: 0, updated: 1, unchanged: 0, earliestChangedDate: "2026-08-18" });
    const candles = storage.getCandlesForActiveSeries(1);
    expect(candles).toHaveLength(2);
    expect(candles.at(-1)?.close).toBe(104);
  });

  it("切换数据源时创建新系列，成功前保留旧活动系列", () => {
    const previous = storage.getActiveMarketSeries(1)!;
    sqlite.prepare("UPDATE instruments SET data_provider='eodhd',provider_symbol='QQQ.US' WHERE id=1").run();
    const candidate = storage.getOrCreateConfiguredSeries(1);
    expect(candidate.id).not.toBe(previous.id);
    expect(candidate.isActive).toBe(false);
    expect(storage.getActiveMarketSeries(1)?.id).toBe(previous.id);
    storage.mergeCandles(candidate, [
      { time: "2026-08-18", open: 102, high: 105, low: 101, close: 104, volume: 1250, source: "eodhd", adjustment: "splits" },
    ]);
    storage.activateMarketSeries(candidate.id);
    expect(storage.getActiveMarketSeries(1)?.id).toBe(candidate.id);
    expect(storage.listMarketSeries(1)).toHaveLength(2);
  });
});
