import type { Candle, Trade, TradeContextSnapshot } from "@/types";
import { atr } from "./atr";
import { sma } from "./moving-average";
import { findConfirmedPivots, nearestPivots } from "./pivot";
import { rollingRange } from "./rolling-range";
import { volumeContext } from "./volume";

export function historicalCandlesForTrade(candles: Candle[], tradeDate: string) {
  return candles.filter((candle) => candle.time < tradeDate);
}

export function analyzeTradeContext(trade: Pick<Trade, "id" | "price" | "tradeDate">, allCandles: Candle[]): TradeContextSnapshot {
  const price = Number(trade.price);
  const historical = historicalCandlesForTrade(allCandles, trade.tradeDate);
  const ranges = { 20: rollingRange(historical, price, 20), 60: rollingRange(historical, price, 60), 120: rollingRange(historical, price, 120), 250: rollingRange(historical, price, 250) };
  const moving = { 5: sma(historical, 5), 10: sma(historical, 10), 20: sma(historical, 20), 60: sma(historical, 60), 120: sma(historical, 120), 250: sma(historical, 250) };
  const atr14 = atr(historical, 14);
  const volume = volumeContext(historical, 20);
  const activeDates = new Set(historical.slice(-120).map((candle) => candle.time));
  const pivots = findConfirmedPivots(historical, 3, 3, historical.at(-1)?.time).filter((pivot) => activeDates.has(pivot.date));
  const nearest = nearestPivots(pivots, price);
  const distance = (value: number | null) => value === null ? null : ((price - value) / value) * 100;
  return {
    tradeId: trade.id, analysisVersion: "2.0", price,
    range20High: ranges[20]?.high ?? null, range20Low: ranges[20]?.low ?? null, range20Percentile: ranges[20]?.percentile ?? null,
    range60High: ranges[60]?.high ?? null, range60Low: ranges[60]?.low ?? null, range60Percentile: ranges[60]?.percentile ?? null,
    range120High: ranges[120]?.high ?? null, range120Low: ranges[120]?.low ?? null, range120Percentile: ranges[120]?.percentile ?? null,
    range250High: ranges[250]?.high ?? null, range250Low: ranges[250]?.low ?? null, range250Percentile: ranges[250]?.percentile ?? null,
    ma5: moving[5], ma10: moving[10], ma20: moving[20], ma60: moving[60], ma120: moving[120], ma250: moving[250],
    distanceToMa20Pct: distance(moving[20]), distanceToMa60Pct: distance(moving[60]), atr14, atrPercent: atr14 === null ? null : (atr14 / price) * 100,
    volume: volume.volume, avgVolume20: volume.average, volumeRatio20: volume.ratio,
    nearestPriorPivotHigh: nearest.high?.price ?? null, distanceToPivotHighPct: nearest.high ? ((nearest.high.price - price) / price) * 100 : null, pivotHighDate: nearest.high?.date ?? null,
    nearestPriorPivotLow: nearest.low?.price ?? null, distanceToPivotLowPct: nearest.low ? ((nearest.low.price - price) / price) * 100 : null, pivotLowDate: nearest.low?.date ?? null,
    daysSince20High: ranges[20]?.daysSinceHigh ?? null, daysSince20Low: ranges[20]?.daysSinceLow ?? null,
  };
}

export function contextLabels(snapshot: TradeContextSnapshot) {
  const labels: string[] = [];
  if ((snapshot.range60Percentile ?? 0) >= 0.8) labels.push("接近 60 日高位");
  if ((snapshot.range60Percentile ?? 1) <= 0.2) labels.push("接近 60 日低位");
  if ((snapshot.distanceToMa20Pct ?? 0) > 0) labels.push("位于 MA20 上方");
  if ((snapshot.distanceToMa60Pct ?? 0) > 10) labels.push("明显偏离 MA60");
  if ((snapshot.distanceToPivotHighPct ?? 99) <= 3) labels.push("接近阻力位");
  if ((snapshot.volumeRatio20 ?? 0) >= 1.5) labels.push("成交量放大");
  return labels;
}
