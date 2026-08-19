import { sqlite } from "@/db";
import { EodhdProvider } from "@/lib/market-data/eodhd";
import { MockProvider } from "@/lib/market-data/mock";
import {
  activateMarketSeries, assessMarketSeriesQuality, completeSyncRun, failSyncRun,
  getOrCreateConfiguredSeries, markSeriesSyncFailure, mergeCandles, startSyncRun,
  type MarketSyncMode,
} from "@/lib/market-data/storage";
import { MarketDataError } from "@/lib/market-data/types";
import { TwelveDataProvider } from "@/lib/market-data/twelve-data";
import { recalculateTradesForInstrument } from "@/lib/trades/persistence";
import type { MarketDataProvider } from "@/lib/market-data/types";

type InstrumentRow = {
  id: number;
  symbol: string;
  providerSymbol: string;
  dataProvider: string;
  timezone: string;
};

const activeSyncs = new Map<number, Promise<MarketSyncResult>>();

export type MarketSyncResult = {
  seriesId: number;
  mode: MarketSyncMode;
  requestedFrom: string | null;
  requestedTo: string | null;
  returned: number;
  inserted: number;
  updated: number;
  unchanged: number;
  total: number;
  earliestDate: string | null;
  latestDate: string | null;
  qualityStatus: string;
  qualityMessage: string;
};

function providerFor(name: string): MarketDataProvider {
  if (name === "twelve-data") return new TwelveDataProvider();
  if (name === "eodhd") return new EodhdProvider();
  if (name === "mock") return new MockProvider();
  throw new MarketDataError("INVALID_RESPONSE", "该股票的行情来源配置无效，请在股票配置中重新选择。");
}

function exchangeDate(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function subtractCalendarDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

async function performSync(instrumentId: number, mode: Exclude<MarketSyncMode, "csv">): Promise<MarketSyncResult> {
  const instrument = sqlite.prepare(`SELECT id,symbol,provider_symbol AS providerSymbol,data_provider AS dataProvider,timezone
    FROM instruments WHERE id=?`).get(instrumentId) as InstrumentRow | undefined;
  if (!instrument) throw new MarketDataError("SYMBOL_NOT_FOUND", "未找到该股票。");
  if (instrument.dataProvider === "csv") throw new MarketDataError("INVALID_RESPONSE", "该股票使用CSV行情，请导入OHLCV文件进行更新。");

  const series = getOrCreateConfiguredSeries(instrumentId);
  const requestedTo = exchangeDate(instrument.timezone);
  const requestedFrom = mode === "backfill" || !series.latestDate
    ? undefined
    : mode === "reconcile" && series.earliestDate
      ? series.earliestDate
      : subtractCalendarDays(series.latestDate, 14);
  const runId = startSyncRun(series.id, mode, requestedFrom, requestedTo);

  try {
    const candles = await providerFor(instrument.dataProvider).getCandles({
      symbol: instrument.providerSymbol || instrument.symbol,
      interval: "1day",
      adjustment: series.adjustment,
      start: requestedFrom,
      end: requestedFrom ? requestedTo : undefined,
    });
    if (!candles.length) throw new MarketDataError("INVALID_RESPONSE", "行情服务没有返回任何K线，本地历史数据未改变。");
    const merged = mergeCandles(series, candles);
    activateMarketSeries(series.id);
    const quality = assessMarketSeriesQuality(series.id);
    completeSyncRun(runId, merged);
    sqlite.prepare(`UPDATE instruments SET market_data_stale=0,last_market_refresh_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(instrumentId);
    if (merged.inserted || merged.updated) recalculateTradesForInstrument(instrumentId);
    const updatedSeries = getOrCreateConfiguredSeries(instrumentId);
    return {
      seriesId: series.id, mode, requestedFrom: requestedFrom ?? null, requestedTo: requestedFrom ? requestedTo : null,
      returned: merged.returned, inserted: merged.inserted, updated: merged.updated, unchanged: merged.unchanged,
      total: updatedSeries.candleCount, earliestDate: updatedSeries.earliestDate, latestDate: updatedSeries.latestDate,
      qualityStatus: quality.status, qualityMessage: quality.message,
    };
  } catch (cause) {
    const error = cause instanceof MarketDataError ? cause : new MarketDataError("UNKNOWN", cause instanceof Error ? cause.message : "行情同步失败。");
    failSyncRun(runId, error.code, error.message);
    markSeriesSyncFailure(series.id, error.message);
    throw error;
  }
}

export function syncInstrumentMarketData(instrumentId: number, mode: Exclude<MarketSyncMode, "csv"> = "incremental") {
  const existing = activeSyncs.get(instrumentId);
  if (existing) return existing;
  const running = performSync(instrumentId, mode).finally(() => activeSyncs.delete(instrumentId));
  activeSyncs.set(instrumentId, running);
  return running;
}
