import { sqlite } from "@/db";
import type { Candle, Instrument, StockWorkspaceData, TradeContextSnapshot, TradeOutcome, TradeWithAnalysis } from "@/types";

type Row = Record<string, unknown>;
const num = (value: unknown) => value === null || value === undefined ? null : Number(value);

export function listInstruments(): Instrument[] {
  const rows = sqlite.prepare("SELECT id, symbol, name, exchange, market, currency, timezone, data_provider AS dataProvider, provider_symbol AS providerSymbol, price_adjustment AS priceAdjustment, market_data_stale AS marketDataStale, last_market_refresh_at AS lastMarketRefreshAt, exit_fee_rate_pct AS exitFeeRatePct, exit_fee_fixed AS exitFeeFixed, exit_fee_minimum AS exitFeeMinimum FROM instruments ORDER BY updated_at DESC").all() as Row[];
  return rows.map(mapInstrument);
}

export function getInstrumentBySymbol(symbol: string): Instrument | null {
  const row = sqlite.prepare("SELECT id, symbol, name, exchange, market, currency, timezone, data_provider AS dataProvider, provider_symbol AS providerSymbol, price_adjustment AS priceAdjustment, market_data_stale AS marketDataStale, last_market_refresh_at AS lastMarketRefreshAt, exit_fee_rate_pct AS exitFeeRatePct, exit_fee_fixed AS exitFeeFixed, exit_fee_minimum AS exitFeeMinimum FROM instruments WHERE UPPER(symbol)=UPPER(?)").get(symbol) as Row | undefined;
  return row ? mapInstrument(row) : null;
}

function mapInstrument(row: Row): Instrument {
  return {
    id: Number(row.id), symbol: String(row.symbol), name: String(row.name), exchange: String(row.exchange), market: String(row.market), currency: String(row.currency), timezone: String(row.timezone),
    dataProvider: String(row.dataProvider), providerSymbol: String(row.providerSymbol), priceAdjustment: String(row.priceAdjustment ?? "raw") as Instrument["priceAdjustment"], marketDataStale: Boolean(row.marketDataStale), lastMarketRefreshAt: row.lastMarketRefreshAt ? String(row.lastMarketRefreshAt) : null,
    exitFeeModel: { ratePct: String(row.exitFeeRatePct ?? "0"), fixed: String(row.exitFeeFixed ?? "0"), minimum: String(row.exitFeeMinimum ?? "0") },
  };
}
function mapCandle(row: Row): Candle { return { id: Number(row.id), instrumentId: Number(row.instrument_id), time: String(row.timestamp), open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume), source: String(row.source), adjustment: String(row.adjustment ?? "raw") as Candle["adjustment"] }; }
function mapSnapshot(row: Row): TradeContextSnapshot | null {
  if (!row.snapshot_id) return null;
  return {
    tradeId: Number(row.id), analysisVersion: String(row.analysis_version), price: Number(row.snapshot_price),
    range20High: num(row.range_20_high), range20Low: num(row.range_20_low), range20Percentile: num(row.range_20_percentile), range60High: num(row.range_60_high), range60Low: num(row.range_60_low), range60Percentile: num(row.range_60_percentile), range120High: num(row.range_120_high), range120Low: num(row.range_120_low), range120Percentile: num(row.range_120_percentile), range250High: num(row.range_250_high), range250Low: num(row.range_250_low), range250Percentile: num(row.range_250_percentile),
    ma5: num(row.ma_5), ma10: num(row.ma_10), ma20: num(row.ma_20), ma60: num(row.ma_60), ma120: num(row.ma_120), ma250: num(row.ma_250), distanceToMa20Pct: num(row.distance_to_ma_20_pct), distanceToMa60Pct: num(row.distance_to_ma_60_pct), atr14: num(row.atr_14), atrPercent: num(row.atr_percent), volume: num(row.volume_snapshot), avgVolume20: num(row.avg_volume_20), volumeRatio20: num(row.volume_ratio_20), nearestPriorPivotHigh: num(row.nearest_prior_pivot_high), distanceToPivotHighPct: num(row.distance_to_pivot_high_pct), pivotHighDate: row.pivot_high_date ? String(row.pivot_high_date) : null, nearestPriorPivotLow: num(row.nearest_prior_pivot_low), distanceToPivotLowPct: num(row.distance_to_pivot_low_pct), pivotLowDate: row.pivot_low_date ? String(row.pivot_low_date) : null, daysSince20High: num(row.days_since_20_high), daysSince20Low: num(row.days_since_20_low), createdAt: String(row.snapshot_created_at),
  };
}
function mapOutcome(row: Row): TradeOutcome | null {
  if (!row.outcome_id) return null;
  return { tradeId: Number(row.id), return1d: num(row.return_1d), return3d: num(row.return_3d), return5d: num(row.return_5d), return10d: num(row.return_10d), return20d: num(row.return_20d), return60d: num(row.return_60d), mfe5d: num(row.mfe_5d), mae5d: num(row.mae_5d), mfe20d: num(row.mfe_20d), mae20d: num(row.mae_20d), maxHigh20d: num(row.max_high_20d), minLow20d: num(row.min_low_20d), sellMissedGain20d: num(row.sell_missed_gain_20d), calculatedThrough: row.calculated_through ? String(row.calculated_through) : null };
}

const tradeSelect = `SELECT t.*, s.name AS strategy, tas.id AS snapshot_id, tas.analysis_version, tas.price AS snapshot_price, tas.range_20_high, tas.range_20_low, tas.range_20_percentile, tas.range_60_high, tas.range_60_low, tas.range_60_percentile, tas.range_120_high, tas.range_120_low, tas.range_120_percentile, tas.range_250_high, tas.range_250_low, tas.range_250_percentile, tas.ma_5, tas.ma_10, tas.ma_20, tas.ma_60, tas.ma_120, tas.ma_250, tas.distance_to_ma_20_pct, tas.distance_to_ma_60_pct, tas.atr_14, tas.atr_percent, tas.volume AS volume_snapshot, tas.avg_volume_20, tas.volume_ratio_20, tas.nearest_prior_pivot_high, tas.distance_to_pivot_high_pct, tas.pivot_high_date, tas.nearest_prior_pivot_low, tas.distance_to_pivot_low_pct, tas.pivot_low_date, tas.days_since_20_high, tas.days_since_20_low, tas.created_at AS snapshot_created_at, o.id AS outcome_id, o.return_1d, o.return_3d, o.return_5d, o.return_10d, o.return_20d, o.return_60d, o.mfe_5d, o.mae_5d, o.mfe_20d, o.mae_20d, o.max_high_20d, o.min_low_20d, o.sell_missed_gain_20d, o.calculated_through FROM trades t LEFT JOIN strategies s ON s.id=t.strategy_id LEFT JOIN trade_analysis_snapshots tas ON tas.trade_id=t.id LEFT JOIN trade_outcomes o ON o.trade_id=t.id`;

function mapTrade(row: Row): TradeWithAnalysis {
  const tags = sqlite.prepare("SELECT tags.name FROM tags JOIN trade_tags ON tags.id=trade_tags.tag_id WHERE trade_tags.trade_id=?").all(row.id).map((item) => String((item as Row).name));
  return { id: Number(row.id), instrumentId: Number(row.instrument_id), accountId: Number(row.account_id ?? 1), side: String(row.side) as "BUY" | "SELL", tradeAt: String(row.trade_at), tradeDate: String(row.trade_date), price: String(row.price), quantity: String(row.quantity), fee: String(row.fee), estimatedExitFee: String(row.estimated_exit_fee ?? "0"), currency: String(row.currency), strategyId: row.strategy_id ? Number(row.strategy_id) : null, strategy: row.strategy ? String(row.strategy) : null, reason: String(row.reason), plan: String(row.plan), note: String(row.note), plannedStop: row.planned_stop ? String(row.planned_stop) : null, plannedTarget: row.planned_target ? String(row.planned_target) : null, tags, snapshot: mapSnapshot(row), outcome: mapOutcome(row) };
}

export function listTrades(instrumentId?: number): TradeWithAnalysis[] {
  const rows = instrumentId ? sqlite.prepare(`${tradeSelect} WHERE t.instrument_id=? ORDER BY t.trade_at DESC`).all(instrumentId) : sqlite.prepare(`${tradeSelect} ORDER BY t.trade_at DESC`).all();
  return (rows as Row[]).map(mapTrade);
}

export function getWorkspace(symbol: string): StockWorkspaceData | null {
  const instrument = getInstrumentBySymbol(symbol); if (!instrument) return null;
  const candleRows = sqlite.prepare("SELECT * FROM candles WHERE instrument_id=? AND interval='1day' ORDER BY timestamp").all(instrument.id) as Row[];
  const levels = sqlite.prepare("SELECT id, price, type, label, note FROM manual_levels WHERE instrument_id=? ORDER BY created_at").all(instrument.id) as StockWorkspaceData["manualLevels"];
  return { instrument, candles: candleRows.map(mapCandle), trades: listTrades(instrument.id), manualLevels: levels, updatedAt: candleRows.at(-1)?.timestamp ? String(candleRows.at(-1)?.timestamp) : null };
}

export function dashboardData() { return { instruments: listInstruments(), trades: listTrades().slice(0, 12) }; }
