import { describe, expect, it } from "vitest";
import { buildMonthlyBuyCohorts, calculateActualCurve, calculateForecastSnapshot } from "../src/lib/dca/analysis";
import type { Candle, Trade } from "../src/types";

function market(count: number): Candle[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(2020, 0, index + 1)).toISOString().slice(0, 10);
    const close = 80 + index * 0.08 + Math.sin(index / 13) * 4 + Math.cos(index / 31) * 2;
    return { time: date, open: close - 0.4, high: close + 1.2, low: close - 1.1, close, volume: 1000 + (index % 17) * 30 };
  });
}

const base = { instrumentId: 1, accountId: 1, currency: "USD", strategyId: null, reason: "", plan: "", note: "", plannedStop: null, plannedTarget: null };

describe("monthly DCA analysis", () => {
  it("groups multiple buys in the same account and calendar month", () => {
    const trades = [
      { ...base, id: 1, side: "BUY", tradeAt: "2026-01-02T10:00:00", tradeDate: "2026-01-02", price: "10", quantity: "10", fee: "1", estimatedExitFee: "1" },
      { ...base, id: 2, side: "BUY", tradeAt: "2026-01-20T10:00:00", tradeDate: "2026-01-20", price: "12", quantity: "5", fee: "2", estimatedExitFee: "1" },
      { ...base, id: 3, accountId: 2, side: "BUY", tradeAt: "2026-01-20T10:00:00", tradeDate: "2026-01-20", price: "20", quantity: "1", fee: "0", estimatedExitFee: "0" },
    ] as Trade[];
    const cohorts = buildMonthlyBuyCohorts(trades);
    expect(cohorts).toHaveLength(2);
    expect(cohorts.find((cohort) => cohort.accountId === 1)).toMatchObject({ anchorDate: "2026-01-20", buyTradeIds: [1, 2] });
    expect(cohorts.find((cohort) => cohort.accountId === 1)?.investedAmount.toFixed(2)).toBe("163.00");
  });

  it("never lets candles on or after the purchase date change a frozen forecast", () => {
    const candles = market(1000);
    const anchorDate = candles[900].time;
    const trades = [{ ...base, id: 1, side: "BUY", tradeAt: `${anchorDate}T10:00:00`, tradeDate: anchorDate, price: String(candles[900].close), quantity: "10", fee: "5", estimatedExitFee: "5" }] as Trade[];
    const cohort = buildMonthlyBuyCohorts(trades)[0];
    const baseline = calculateForecastSnapshot(candles, cohort, { ratePct: "0", fixed: "0", minimum: "0" });
    const poisoned = candles.map((candle) => candle.time >= anchorDate ? { ...candle, close: candle.close * 100, high: candle.high * 100 } : candle);
    expect(calculateForecastSnapshot(poisoned, cohort, { ratePct: "0", fixed: "0", minimum: "0" })).toEqual(baseline);
    expect(baseline.sampleCount).toBeGreaterThanOrEqual(100);
    expect(baseline.points).toHaveLength(61);
  });

  it("starts below zero when buy and estimated sell fees have not been recovered", () => {
    const candles = market(320);
    const anchorDate = candles[300].time;
    const price = candles[300].close;
    const trades = [{ ...base, id: 1, side: "BUY", tradeAt: `${anchorDate}T10:00:00`, tradeDate: anchorDate, price: String(price), quantity: "10", fee: "5", estimatedExitFee: "5" }] as Trade[];
    const cohort = buildMonthlyBuyCohorts(trades)[0];
    const curve = calculateActualCurve(candles, trades, cohort, { ratePct: "0", fixed: "0", minimum: "0" });
    const expected = ((price * 10 - 5) - (price * 10 + 5)) / (price * 10 + 5) * 100;
    expect(curve[0].returnPct).toBeCloseTo(expected, 4);
    expect(curve[0].estimatedExitFee).toBe("5.00");
  });

  it("includes FIFO partial-sale cash and values only the remaining quantity", () => {
    const candles = market(330);
    const buyDate = candles[300].time;
    const sellDate = candles[305].time;
    const trades = [
      { ...base, id: 1, side: "BUY", tradeAt: `${buyDate}T10:00:00`, tradeDate: buyDate, price: "100", quantity: "10", fee: "10", estimatedExitFee: "5" },
      { ...base, id: 2, side: "SELL", tradeAt: `${sellDate}T10:00:00`, tradeDate: sellDate, price: "120", quantity: "4", fee: "4", estimatedExitFee: "0" },
    ] as Trade[];
    const curve = calculateActualCurve(candles, trades, buildMonthlyBuyCohorts(trades)[0], { ratePct: "0", fixed: "0", minimum: "0" });
    const afterSell = curve.find((point) => point.date === sellDate)!;
    expect(afterSell.remainingQuantity).toBe("6");
    expect(afterSell.realizedNetCash).toBe("476.00");
    expect(afterSell.estimatedExitFee).toBe("3.00");
  });
});
