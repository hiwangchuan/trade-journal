import type { Candle } from "@/types";

export function trueRange(current: Candle, previous?: Candle) {
  if (!previous) return current.high - current.low;
  return Math.max(current.high - current.low, Math.abs(current.high - previous.close), Math.abs(current.low - previous.close));
}

export function atr(candles: Candle[], window = 14): number | null {
  if (candles.length < window + 1 || window <= 0) return null;
  const ranges = candles.slice(1).map((candle, index) => trueRange(candle, candles[index]));
  let value = ranges.slice(0, window).reduce((sum, item) => sum + item, 0) / window;
  for (const range of ranges.slice(window)) value = ((value * (window - 1)) + range) / window;
  return value;
}
