import type { Candle } from "@/types";

export function volumeContext(candles: Candle[], window = 20) {
  if (candles.length < window + 1 || window <= 0) return { volume: null, average: null, ratio: null };
  const volume = candles.at(-1)?.volume ?? null;
  const comparison = candles.slice(-(window + 1), -1);
  const average = comparison.reduce((sum, candle) => sum + candle.volume, 0) / window;
  return { volume, average, ratio: volume !== null && average !== 0 ? volume / average : null };
}
