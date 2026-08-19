import type { Candle } from "@/types";

export type RollingRange = { high: number; low: number; percentile: number; daysSinceHigh: number; daysSinceLow: number } | null;

export function rollingRange(candles: Candle[], price: number, window: number): RollingRange {
  if (candles.length < window || window <= 0) return null;
  const slice = candles.slice(-window);
  let high = -Infinity, low = Infinity, highIndex = 0, lowIndex = 0;
  for (let index = 0; index < slice.length; index += 1) {
    const candle = slice[index];
    if (candle.high >= high) { high = candle.high; highIndex = index; }
    if (candle.low <= low) { low = candle.low; lowIndex = index; }
  }
  const percentile = high === low ? 0.5 : (price - low) / (high - low);
  return { high, low, percentile, daysSinceHigh: slice.length - 1 - highIndex, daysSinceLow: slice.length - 1 - lowIndex };
}
