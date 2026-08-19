import type { Candle } from "@/types";

export type Pivot = { date: string; price: number; type: "HIGH" | "LOW"; confirmedAt: string };

export function findConfirmedPivots(candles: Candle[], left = 3, right = 3, cutoff?: string): Pivot[] {
  const pivots: Pivot[] = [];
  for (let index = left; index < candles.length - right; index += 1) {
    const confirmedAt = candles[index + right].time;
    if (cutoff && confirmedAt > cutoff) continue;
    const current = candles[index];
    let isHigh = true, isLow = true;
    for (let cursor = index - left; cursor <= index + right; cursor += 1) {
      if (cursor === index) continue;
      if (candles[cursor].high >= current.high) isHigh = false;
      if (candles[cursor].low <= current.low) isLow = false;
    }
    if (isHigh) pivots.push({ date: current.time, price: current.high, type: "HIGH", confirmedAt });
    if (isLow) pivots.push({ date: current.time, price: current.low, type: "LOW", confirmedAt });
  }
  return pivots;
}

export function nearestPivots(pivots: Pivot[], price: number) {
  let high: Pivot | null = null, low: Pivot | null = null;
  for (const pivot of pivots) {
    if (pivot.type === "HIGH" && pivot.price >= price && (!high || pivot.price < high.price)) high = pivot;
    if (pivot.type === "LOW" && pivot.price <= price && (!low || pivot.price > low.price)) low = pivot;
  }
  return { high, low };
}
