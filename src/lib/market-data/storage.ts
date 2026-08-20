import { sqlite } from "@/db";
import { validateCandles } from "@/lib/market-data/types";
import type { Candle, PriceAdjustment } from "@/types";

export type MarketSyncMode = "incremental" | "backfill" | "reconcile" | "csv";

export type MarketSeries = {
  id: number;
  instrumentId: number;
  provider: string;
  providerSymbol: string;
  interval: "1day";
  adjustment: PriceAdjustment;
  currency: string;
  exchange: string;
  timezone: string;
  isActive: boolean;
  earliestDate: string | null;
  latestDate: string | null;
  candleCount: number;
  dataRevision: number;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastReconciledAt: string | null;
  status: string;
  qualityMessage: string;
};

type InstrumentSeriesConfig = {
  id: number;
  dataProvider: string;
  providerSymbol: string;
  priceAdjustment: PriceAdjustment;
  currency: string;
  exchange: string;
  timezone: string;
};

export type MergeResult = {
  returned: number;
  inserted: number;
  updated: number;
  unchanged: number;
  earliestChangedDate: string | null;
};

const seriesSelect = `SELECT id,instrument_id AS instrumentId,provider,provider_symbol AS providerSymbol,
  interval,adjustment,currency,exchange,timezone,is_active AS isActive,earliest_date AS earliestDate,
  latest_date AS latestDate,candle_count AS candleCount,data_revision AS dataRevision,
  last_attempt_at AS lastAttemptAt,last_success_at AS lastSuccessAt,status,quality_message AS qualityMessage
  ,last_reconciled_at AS lastReconciledAt
  FROM market_data_series`;

function mapSeries(row: Record<string, unknown>): MarketSeries {
  return {
    id: Number(row.id), instrumentId: Number(row.instrumentId), provider: String(row.provider),
    providerSymbol: String(row.providerSymbol), interval: "1day", adjustment: String(row.adjustment) as PriceAdjustment,
    currency: String(row.currency), exchange: String(row.exchange), timezone: String(row.timezone),
    isActive: Boolean(row.isActive), earliestDate: row.earliestDate ? String(row.earliestDate) : null,
    latestDate: row.latestDate ? String(row.latestDate) : null, candleCount: Number(row.candleCount),
    dataRevision: Number(row.dataRevision), lastAttemptAt: row.lastAttemptAt ? String(row.lastAttemptAt) : null,
    lastSuccessAt: row.lastSuccessAt ? String(row.lastSuccessAt) : null, status: String(row.status),
    lastReconciledAt: row.lastReconciledAt ? String(row.lastReconciledAt) : null,
    qualityMessage: String(row.qualityMessage ?? ""),
  };
}

export function getActiveMarketSeries(instrumentId: number): MarketSeries | null {
  const row = sqlite.prepare(`${seriesSelect} WHERE instrument_id=? AND is_active=1 ORDER BY id DESC LIMIT 1`).get(instrumentId) as Record<string, unknown> | undefined;
  return row ? mapSeries(row) : null;
}

export function listMarketSeries(instrumentId: number): MarketSeries[] {
  return (sqlite.prepare(`${seriesSelect} WHERE instrument_id=? ORDER BY is_active DESC,id DESC`).all(instrumentId) as Record<string, unknown>[]).map(mapSeries);
}

export function getOrCreateConfiguredSeries(instrumentId: number): MarketSeries {
  const instrument = sqlite.prepare(`SELECT id,data_provider AS dataProvider,provider_symbol AS providerSymbol,
    price_adjustment AS priceAdjustment,currency,exchange,timezone FROM instruments WHERE id=?`).get(instrumentId) as InstrumentSeriesConfig | undefined;
  if (!instrument) throw new Error("未找到该股票。");

  sqlite.prepare(`INSERT OR IGNORE INTO market_data_series(
    instrument_id,provider,provider_symbol,interval,adjustment,currency,exchange,timezone,is_active,status
  ) VALUES (?,?,?,'1day',?,?,?,?,0,'EMPTY')`).run(
    instrument.id, instrument.dataProvider, instrument.providerSymbol, instrument.priceAdjustment,
    instrument.currency, instrument.exchange, instrument.timezone,
  );
  const row = sqlite.prepare(`${seriesSelect} WHERE instrument_id=? AND provider=? AND provider_symbol=? AND interval='1day' AND adjustment=?`).get(
    instrument.id, instrument.dataProvider, instrument.providerSymbol, instrument.priceAdjustment,
  ) as Record<string, unknown>;
  return mapSeries(row);
}

export function activateMarketSeries(seriesId: number) {
  sqlite.transaction(() => {
    const series = sqlite.prepare("SELECT instrument_id AS instrumentId FROM market_data_series WHERE id=?").get(seriesId) as { instrumentId: number } | undefined;
    if (!series) throw new Error("行情数据系列不存在。");
    sqlite.prepare("UPDATE market_data_series SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE instrument_id=? AND id<>?").run(series.instrumentId, seriesId);
    sqlite.prepare("UPDATE market_data_series SET is_active=1,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(seriesId);
  })();
}

function sameNumber(left: number, right: number) {
  return Math.abs(left - right) <= Math.max(1, Math.abs(left), Math.abs(right)) * 1e-10;
}

function earlierDate(current: string | null, candidate: string) {
  return current === null || candidate.localeCompare(current) < 0 ? candidate : current;
}

export function mergeCandles(series: MarketSeries, incoming: Candle[]): MergeResult {
  const checked = validateCandles(incoming).map((candle) => ({ ...candle, adjustment: series.adjustment }));
  return sqlite.transaction(() => {
    const find = sqlite.prepare("SELECT open,high,low,close,volume,source,adjustment FROM candles WHERE series_id=? AND timestamp=?");
    const insert = sqlite.prepare(`INSERT INTO candles(
      instrument_id,series_id,interval,timestamp,open,high,low,close,volume,source,adjustment
    ) VALUES (?,?,'1day',?,?,?,?,?,?,?,?)`);
    const update = sqlite.prepare(`UPDATE candles SET open=?,high=?,low=?,close=?,volume=?,source=?,adjustment=?,updated_at=CURRENT_TIMESTAMP
      WHERE series_id=? AND timestamp=?`);
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    let earliestChangedDate: string | null = null;

    for (const candle of checked) {
      const existing = find.get(series.id, candle.time) as { open: number; high: number; low: number; close: number; volume: number; source: string; adjustment: string } | undefined;
      const source = candle.source ?? series.provider;
      if (!existing) {
        insert.run(series.instrumentId, series.id, candle.time, candle.open, candle.high, candle.low, candle.close, candle.volume, source, series.adjustment);
        inserted += 1;
        earliestChangedDate = earlierDate(earliestChangedDate, candle.time);
        continue;
      }
      const changed = !sameNumber(existing.open, candle.open) || !sameNumber(existing.high, candle.high)
        || !sameNumber(existing.low, candle.low) || !sameNumber(existing.close, candle.close)
        || !sameNumber(existing.volume, candle.volume) || existing.source !== source || existing.adjustment !== series.adjustment;
      if (!changed) {
        unchanged += 1;
        continue;
      }
      update.run(candle.open, candle.high, candle.low, candle.close, candle.volume, source, series.adjustment, series.id, candle.time);
      updated += 1;
      earliestChangedDate = earlierDate(earliestChangedDate, candle.time);
    }

    sqlite.prepare(`UPDATE market_data_series SET
      earliest_date=(SELECT MIN(timestamp) FROM candles WHERE series_id=?),
      latest_date=(SELECT MAX(timestamp) FROM candles WHERE series_id=?),
      candle_count=(SELECT COUNT(*) FROM candles WHERE series_id=?),
      data_revision=data_revision+?,last_success_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
      WHERE id=?`).run(series.id, series.id, series.id, inserted + updated > 0 ? 1 : 0, series.id);

    return { returned: checked.length, inserted, updated, unchanged, earliestChangedDate };
  })();
}

export function assessMarketSeriesQuality(seriesId: number) {
  const rows = sqlite.prepare("SELECT timestamp,close FROM candles WHERE series_id=? ORDER BY timestamp").all(seriesId) as Array<{ timestamp: string; close: number }>;
  const flags: string[] = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    const gapDays = Math.round((Date.parse(`${current.timestamp}T00:00:00Z`) - Date.parse(`${previous.timestamp}T00:00:00Z`)) / 86_400_000);
    if (gapDays > 10) flags.push(`${previous.timestamp} 至 ${current.timestamp} 疑似缺失行情`);
    const move = Math.abs(current.close / previous.close - 1);
    if (move > 0.6) flags.push(`${current.timestamp} 出现 ${Math.round(move * 100)}% 价格跳变，需检查复权或公司行为`);
    if (flags.length >= 3) break;
  }
  const status = rows.length === 0 ? "EMPTY" : flags.length ? "REVIEW" : "HEALTHY";
  const message = flags.join("；");
  sqlite.prepare("UPDATE market_data_series SET status=?,quality_message=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(status, message, seriesId);
  return { status, message, candleCount: rows.length };
}

export function startSyncRun(seriesId: number, mode: MarketSyncMode, requestedFrom?: string, requestedTo?: string) {
  sqlite.prepare("UPDATE market_data_series SET last_attempt_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(seriesId);
  return Number(sqlite.prepare(`INSERT INTO market_sync_runs(series_id,mode,requested_from,requested_to)
    VALUES (?,?,?,?)`).run(seriesId, mode, requestedFrom ?? null, requestedTo ?? null).lastInsertRowid);
}

export function completeSyncRun(runId: number, result: MergeResult) {
  sqlite.prepare(`UPDATE market_sync_runs SET status='SUCCESS',returned_count=?,inserted_count=?,updated_count=?,unchanged_count=?,completed_at=CURRENT_TIMESTAMP
    WHERE id=?`).run(result.returned, result.inserted, result.updated, result.unchanged, runId);
}

export function failSyncRun(runId: number, code: string, message: string) {
  sqlite.prepare(`UPDATE market_sync_runs SET status='FAILED',error_code=?,error_message=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).run(code, message, runId);
}

export function markSeriesSyncFailure(seriesId: number, message: string) {
  const series = sqlite.prepare("SELECT candle_count AS candleCount FROM market_data_series WHERE id=?").get(seriesId) as { candleCount: number };
  sqlite.prepare("UPDATE market_data_series SET status=?,quality_message=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .run(series.candleCount > 0 ? "STALE" : "ERROR", message, seriesId);
}

export type MarketSyncSettings = { autoSync: boolean; staleAfterHours: number; reconcileIntervalDays: number };

export function getMarketSyncSettings(): MarketSyncSettings {
  const row = sqlite.prepare(`SELECT auto_sync AS autoSync,stale_after_hours AS staleAfterHours,
    reconcile_interval_days AS reconcileIntervalDays FROM market_sync_settings WHERE id=1`).get() as Record<string, unknown> | undefined;
  return row
    ? { autoSync: Boolean(row.autoSync), staleAfterHours: Number(row.staleAfterHours), reconcileIntervalDays: Number(row.reconcileIntervalDays) }
    : { autoSync: true, staleAfterHours: 18, reconcileIntervalDays: 30 };
}

export function saveMarketSyncSettings(settings: MarketSyncSettings) {
  sqlite.prepare(`INSERT INTO market_sync_settings(id,auto_sync,stale_after_hours,reconcile_interval_days,updated_at)
    VALUES (1,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET auto_sync=excluded.auto_sync,stale_after_hours=excluded.stale_after_hours,
      reconcile_interval_days=excluded.reconcile_interval_days,updated_at=CURRENT_TIMESTAMP`)
    .run(settings.autoSync ? 1 : 0, settings.staleAfterHours, settings.reconcileIntervalDays);
  return getMarketSyncSettings();
}

export function listMarketSyncRuns(instrumentId: number, limit = 20) {
  return sqlite.prepare(`SELECT r.id,r.mode,r.status,r.requested_from AS requestedFrom,r.requested_to AS requestedTo,
    r.returned_count AS returnedCount,r.inserted_count AS insertedCount,r.updated_count AS updatedCount,
    r.unchanged_count AS unchangedCount,r.error_code AS errorCode,r.error_message AS errorMessage,
    r.started_at AS startedAt,r.completed_at AS completedAt
    FROM market_sync_runs r JOIN market_data_series s ON s.id=r.series_id
    WHERE s.instrument_id=? ORDER BY r.id DESC LIMIT ?`).all(instrumentId, limit);
}

export function getCandlesForActiveSeries(instrumentId: number): Candle[] {
  return sqlite.prepare(`SELECT c.id,c.instrument_id AS instrumentId,c.timestamp AS time,c.open,c.high,c.low,c.close,c.volume,c.source,c.adjustment
    FROM candles c JOIN market_data_series s ON s.id=c.series_id
    WHERE s.instrument_id=? AND s.is_active=1 AND c.interval='1day' ORDER BY c.timestamp`).all(instrumentId) as Candle[];
}
