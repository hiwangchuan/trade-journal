import { describe, expect, it } from "vitest";
import { analyzePriceLevel } from "../src/lib/price-levels/analysis";
import { priceLevelInputSchema } from "../src/lib/price-levels/validation";
import type { Candle } from "../src/types";

const candles: Candle[] = Array.from({ length: 80 }, (_, index) => {
  const close = index < 10 ? 110 - index : index < 30 ? 100 + (index - 10) * 0.5 : 109 - (index - 30) * 0.7;
  const date = new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10);
  return { time: date, open: close + 0.2, high: close + 1, low: close - 1, close, volume: 1000 };
});

describe("price level analysis", () => {
  it("ignores candles before the level became effective", () => {
    const startDate = candles[20].time;
    const result = analyzePriceLevel(candles, { price: 100, type: "SUPPORT", startDate, endDate: null });
    expect(result.firstTouchDate === null || result.firstTouchDate >= startDate).toBe(true);
    expect(result.asOfDate).toBe(candles.at(-1)?.time);
  });

  it("counts touch events and measures returns from the first touch", () => {
    const result = analyzePriceLevel(candles, { price: 100, type: "SUPPORT", startDate: candles[0].time, endDate: null });
    expect(result.touchCount).toBeGreaterThan(0);
    expect(result.firstTouchDate).not.toBeNull();
    expect(result.return5d).not.toBeNull();
    expect(result.firstBreakDate).not.toBeNull();
    expect(result.status).toBe("BROKEN");
  });

  it("marks an ended level as archived", () => {
    const result = analyzePriceLevel(candles, { price: 100, type: "CUSTOM", startDate: candles[0].time, endDate: candles[20].time });
    expect(result.status).toBe("ARCHIVED");
    expect(result.asOfDate).toBe(candles[19].time);
  });

  it("rejects invalid prices and empty labels", () => {
    expect(priceLevelInputSchema.safeParse({ price: 0, type: "SUPPORT", label: "", note: "" }).success).toBe(false);
    expect(priceLevelInputSchema.safeParse({ price: 100, type: "SUPPORT", label: "周线支撑", note: "" }).success).toBe(true);
  });
});
