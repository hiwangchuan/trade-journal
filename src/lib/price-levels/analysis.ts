import type { Candle, PriceLevelStats, PriceLevelType } from "@/types";

const outcome = (candles: Candle[], startIndex: number, horizon: number) => {
  const end = candles[startIndex + horizon];
  if (!end) return null;
  return ((end.close / candles[startIndex].close) - 1) * 100;
};

export function analyzePriceLevel(
  candles: Candle[],
  level: { price: number; type: PriceLevelType; startDate: string; endDate: string | null },
): PriceLevelStats {
  const eligible = candles.filter((candle) => candle.time >= level.startDate && (!level.endDate || candle.time < level.endDate));
  const last = eligible.at(-1) ?? null;
  let touchCount = 0;
  let firstTouchIndex = -1;
  let firstBreakDate: string | null = null;
  let touchingPrevious = false;

  for (let index = 0; index < eligible.length; index += 1) {
    const candle = eligible[index];
    const touching = candle.low <= level.price && candle.high >= level.price;
    if (touching && !touchingPrevious) {
      touchCount += 1;
      if (firstTouchIndex < 0) firstTouchIndex = index;
    }
    touchingPrevious = touching;

    if (!firstBreakDate) {
      if (level.type === "SUPPORT" && candle.close < level.price) firstBreakDate = candle.time;
      if (level.type === "RESISTANCE" && candle.close > level.price) firstBreakDate = candle.time;
      if (level.type === "CUSTOM" && index > 0) {
        const previous = eligible[index - 1].close - level.price;
        const current = candle.close - level.price;
        if ((previous < 0 && current >= 0) || (previous > 0 && current <= 0)) firstBreakDate = candle.time;
      }
    }
  }

  const firstTouch = firstTouchIndex >= 0 ? eligible[firstTouchIndex] : null;
  return {
    status: level.endDate ? "ARCHIVED" : firstBreakDate ? "BROKEN" : firstTouch ? "TOUCHED" : "WAITING",
    asOfDate: last?.time ?? null,
    currentDistancePct: last ? ((last.close / level.price) - 1) * 100 : null,
    touchCount,
    firstTouchDate: firstTouch?.time ?? null,
    firstBreakDate,
    return5d: firstTouch ? outcome(eligible, firstTouchIndex, 5) : null,
    return20d: firstTouch ? outcome(eligible, firstTouchIndex, 20) : null,
    return60d: firstTouch ? outcome(eligible, firstTouchIndex, 60) : null,
  };
}
