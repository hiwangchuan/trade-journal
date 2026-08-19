import type { Candle } from "@/types";

export function sma(candles: Candle[], window: number): number | null {
  if (window <= 0 || candles.length < window) return null;
  let total = 0;
  for (let index = candles.length - window; index < candles.length; index += 1) total += candles[index].close;
  return total / window;
}

export function smaSeries(candles: Candle[], window: number) {
  if (window <= 0) return [];
  const points: Array<{ time: string; value: number }> = [];
  let sum = 0;
  for (let index = 0; index < candles.length; index += 1) {
    sum += candles[index].close;
    if (index >= window) sum -= candles[index - window].close;
    if (index >= window - 1) points.push({ time: candles[index].time, value: sum / window });
  }
  return points;
}
