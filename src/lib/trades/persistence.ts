import { sqlite } from "@/db";
import { analyzeTradeContext } from "@/lib/analysis/trade-context";
import { calculateTradeOutcome } from "@/lib/analysis/trade-outcome";
import { validateCandles } from "@/lib/market-data/types";
import type { PriceAdjustment } from "@/types";
import type { Candle, Trade } from "@/types";

export function recalculateTrade(tradeId: number) {
  const trade = sqlite.prepare("SELECT id,instrument_id AS instrumentId,account_id AS accountId,side,trade_at AS tradeAt,trade_date AS tradeDate,price,quantity,fee,estimated_exit_fee AS estimatedExitFee,currency,strategy_id AS strategyId,reason,plan,note,planned_stop AS plannedStop,planned_target AS plannedTarget FROM trades WHERE id=?").get(tradeId) as Trade | undefined;
  if (!trade) return false;
  const candles = sqlite.prepare("SELECT timestamp AS time,open,high,low,close,volume,source FROM candles WHERE instrument_id=? ORDER BY timestamp").all(trade.instrumentId) as Candle[];
  const snapshot = analyzeTradeContext(trade, candles); const outcome = calculateTradeOutcome(trade, candles);
  sqlite.prepare(`INSERT INTO trade_analysis_snapshots(trade_id,analysis_version,price,range_20_high,range_20_low,range_20_percentile,range_60_high,range_60_low,range_60_percentile,range_120_high,range_120_low,range_120_percentile,range_250_high,range_250_low,range_250_percentile,ma_5,ma_10,ma_20,ma_60,ma_120,ma_250,distance_to_ma_20_pct,distance_to_ma_60_pct,atr_14,atr_percent,volume,avg_volume_20,volume_ratio_20,nearest_prior_pivot_high,distance_to_pivot_high_pct,pivot_high_date,nearest_prior_pivot_low,distance_to_pivot_low_pct,pivot_low_date,days_since_20_high,days_since_20_low) VALUES (@tradeId,@analysisVersion,@price,@range20High,@range20Low,@range20Percentile,@range60High,@range60Low,@range60Percentile,@range120High,@range120Low,@range120Percentile,@range250High,@range250Low,@range250Percentile,@ma5,@ma10,@ma20,@ma60,@ma120,@ma250,@distanceToMa20Pct,@distanceToMa60Pct,@atr14,@atrPercent,@volume,@avgVolume20,@volumeRatio20,@nearestPriorPivotHigh,@distanceToPivotHighPct,@pivotHighDate,@nearestPriorPivotLow,@distanceToPivotLowPct,@pivotLowDate,@daysSince20High,@daysSince20Low) ON CONFLICT(trade_id) DO UPDATE SET analysis_version=excluded.analysis_version,price=excluded.price,range_20_high=excluded.range_20_high,range_20_low=excluded.range_20_low,range_20_percentile=excluded.range_20_percentile,range_60_high=excluded.range_60_high,range_60_low=excluded.range_60_low,range_60_percentile=excluded.range_60_percentile,range_120_high=excluded.range_120_high,range_120_low=excluded.range_120_low,range_120_percentile=excluded.range_120_percentile,range_250_high=excluded.range_250_high,range_250_low=excluded.range_250_low,range_250_percentile=excluded.range_250_percentile,ma_5=excluded.ma_5,ma_10=excluded.ma_10,ma_20=excluded.ma_20,ma_60=excluded.ma_60,ma_120=excluded.ma_120,ma_250=excluded.ma_250,distance_to_ma_20_pct=excluded.distance_to_ma_20_pct,distance_to_ma_60_pct=excluded.distance_to_ma_60_pct,atr_14=excluded.atr_14,atr_percent=excluded.atr_percent,volume=excluded.volume,avg_volume_20=excluded.avg_volume_20,volume_ratio_20=excluded.volume_ratio_20,nearest_prior_pivot_high=excluded.nearest_prior_pivot_high,distance_to_pivot_high_pct=excluded.distance_to_pivot_high_pct,pivot_high_date=excluded.pivot_high_date,nearest_prior_pivot_low=excluded.nearest_prior_pivot_low,distance_to_pivot_low_pct=excluded.distance_to_pivot_low_pct,pivot_low_date=excluded.pivot_low_date,days_since_20_high=excluded.days_since_20_high,days_since_20_low=excluded.days_since_20_low`).run(snapshot);
  sqlite.prepare(`INSERT INTO trade_outcomes(trade_id,return_1d,return_3d,return_5d,return_10d,return_20d,return_60d,mfe_5d,mae_5d,mfe_20d,mae_20d,max_high_20d,min_low_20d,sell_missed_gain_20d,calculated_through) VALUES (@tradeId,@return1d,@return3d,@return5d,@return10d,@return20d,@return60d,@mfe5d,@mae5d,@mfe20d,@mae20d,@maxHigh20d,@minLow20d,@sellMissedGain20d,@calculatedThrough) ON CONFLICT(trade_id) DO UPDATE SET return_1d=excluded.return_1d,return_3d=excluded.return_3d,return_5d=excluded.return_5d,return_10d=excluded.return_10d,return_20d=excluded.return_20d,return_60d=excluded.return_60d,mfe_5d=excluded.mfe_5d,mae_5d=excluded.mae_5d,mfe_20d=excluded.mfe_20d,mae_20d=excluded.mae_20d,max_high_20d=excluded.max_high_20d,min_low_20d=excluded.min_low_20d,sell_missed_gain_20d=excluded.sell_missed_gain_20d,calculated_through=excluded.calculated_through,updated_at=CURRENT_TIMESTAMP`).run(outcome);
  return true;
}

export function syncTags(tradeId: number, names: string[]) {
  sqlite.prepare("DELETE FROM trade_tags WHERE trade_id=?").run(tradeId);
  const insertTag = sqlite.prepare("INSERT OR IGNORE INTO tags(name) VALUES (?)"); const findTag = sqlite.prepare("SELECT id FROM tags WHERE name=?"); const link = sqlite.prepare("INSERT OR IGNORE INTO trade_tags(trade_id,tag_id) VALUES (?,?)");
  for (const name of names) { insertTag.run(name); const tag = findTag.get(name) as { id: number }; link.run(tradeId, tag.id); }
}

function replaceCandleDataset(instrumentId: number, candles: Candle[], adjustment: PriceAdjustment) {
  const checked = validateCandles(candles);
  const statement = sqlite.prepare("INSERT INTO candles(instrument_id,interval,timestamp,open,high,low,close,volume,source,adjustment) VALUES (?,'1day',?,?,?,?,?,?,?,?)");
  sqlite.prepare("DELETE FROM candles WHERE instrument_id=?").run(instrumentId);
  for (const candle of checked) statement.run(instrumentId, candle.time, candle.open, candle.high, candle.low, candle.close, candle.volume, candle.source ?? "unknown", candle.adjustment ?? adjustment);
  sqlite.prepare("UPDATE instruments SET market_data_stale=0,last_market_refresh_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(instrumentId);
}

export function upsertCandles(instrumentId: number, candles: Candle[], adjustment: PriceAdjustment = candles[0]?.adjustment ?? "raw") {
  sqlite.transaction(() => replaceCandleDataset(instrumentId, candles, adjustment))();
}

export function replaceCandlesAndRecalculate(instrumentId: number, candles: Candle[], adjustment: PriceAdjustment) {
  sqlite.transaction(() => {
    replaceCandleDataset(instrumentId, candles, adjustment);
    const tradeIds = sqlite.prepare("SELECT id FROM trades WHERE instrument_id=? ORDER BY trade_at,id").all(instrumentId) as Array<{ id: number }>;
    for (const trade of tradeIds) recalculateTrade(trade.id);
  })();
}
