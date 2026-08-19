import { describe, expect, it } from "vitest";
import type { Candle, Trade } from "../src/types";
import { rollingRange } from "../src/lib/analysis/rolling-range";
import { sma } from "../src/lib/analysis/moving-average";
import { atr, trueRange } from "../src/lib/analysis/atr";
import { findConfirmedPivots } from "../src/lib/analysis/pivot";
import { analyzeTradeContext } from "../src/lib/analysis/trade-context";
import { calculateTradeOutcome } from "../src/lib/analysis/trade-outcome";
import { pairTradesFifo } from "../src/lib/analysis/trade-pairing";
import { calculateBreakEven, solveExitBreakEven } from "../src/lib/trades/fees";
import { calculatePositionCostAtTrade, calculatePositionCostTimeline } from "../src/lib/trades/position-cost";
import { validateLongOnlyTimeline } from "../src/lib/trades/validation";
import { buildClosedCampaigns, campaignMetrics } from "../src/lib/analysis/campaign-analysis";

const candles = (count: number, start = 10): Candle[] => Array.from({ length: count }, (_, index) => ({
  time: `2026-01-${String(index + 1).padStart(2, "0")}`, open: start + index, high: start + index + 2, low: start + index - 1, close: start + index + 1, volume: 100 + index,
}));

describe("rolling range", () => {
  it("calculates high, low and percentile", () => expect(rollingRange(candles(20), 20, 20)).toMatchObject({ high: 31, low: 9, percentile: 0.5 }));
  it("handles a flat range", () => expect(rollingRange(Array.from({ length: 20 }, (_, i) => ({ time: `${i}`, open: 5, high: 5, low: 5, close: 5, volume: 1 })), 5, 20)?.percentile).toBe(0.5));
  it("keeps breakout magnitude instead of clamping to 100%", () => expect(rollingRange(candles(20), 42, 20)?.percentile).toBeGreaterThan(1));
});

describe("moving averages and ATR", () => {
  it("calculates SMA and reports insufficient history", () => { expect(sma(candles(5), 5)).toBe(13); expect(sma(candles(4), 5)).toBeNull(); });
  it("uses true range gaps", () => expect(trueRange({ time: "b", open: 15, high: 16, low: 14, close: 15, volume: 1 }, { time: "a", open: 10, high: 11, low: 9, close: 10, volume: 1 })).toBe(6));
  it("calculates ATR14", () => expect(atr(candles(15), 14)).toBe(3));
});

describe("pivot confirmation", () => {
  const data: Candle[] = [1, 2, 5, 2, 1, 3, 1].map((high, i) => ({ time: `2026-01-0${i + 1}`, open: 1, high, low: -high, close: 1, volume: 1 }));
  it("finds confirmed pivots", () => expect(findConfirmedPivots(data, 2, 2).some((pivot) => pivot.date === "2026-01-03" && pivot.type === "HIGH")).toBe(true));
  it("protects against right-side lookahead", () => expect(findConfirmedPivots(data, 2, 2, "2026-01-04").some((pivot) => pivot.date === "2026-01-03")).toBe(false));
});

describe("snapshot cutoff", () => {
  it("never includes the trade day or future candles", () => {
    const history = candles(60);
    const trade = { id: 1, price: "100", tradeDate: history[50].time };
    const baseline = analyzeTradeContext(trade, history);
    const poisoned = history.map((candle, index) => index >= 50 ? { ...candle, high: 10000, low: 0, close: 9000 } : candle);
    expect(analyzeTradeContext(trade, poisoned)).toEqual(baseline);
  });
});

describe("outcome", () => {
  it("waits for the full excursion horizon", () => {
    const data: Candle[] = [
      { time: "2026-01-01", open: 10, high: 11, low: 9, close: 10, volume: 1 },
      { time: "2026-01-02", open: 10, high: 12, low: 8, close: 11, volume: 1 },
      { time: "2026-01-03", open: 11, high: 13, low: 10, close: 12, volume: 1 },
    ];
    const result = calculateTradeOutcome({ id: 1, side: "BUY", price: "10", tradeDate: "2026-01-01" }, data);
    expect(result.return1d).toBeCloseTo(10); expect(result.mfe5d).toBeNull(); expect(result.mae20d).toBeNull();
  });
  it("calculates MFE and MAE after a complete five-day horizon", () => { const data = candles(7, 10); const result = calculateTradeOutcome({ id: 1, side: "BUY", price: "10", tradeDate: data[0].time }, data); expect(result.mfe5d).not.toBeNull(); expect(result.mae5d).not.toBeNull(); expect(result.mfe20d).toBeNull(); });
});

describe("FIFO pairing", () => {
  it("pairs BUY BUY SELL SELL lots", () => {
    const base = { instrumentId: 1, accountId: 1, fee: "0", estimatedExitFee: "0", currency: "USD", strategyId: null, reason: "", plan: "", note: "", plannedStop: null, plannedTarget: null };
    const trades = [
      { ...base, id: 1, side: "BUY", tradeAt: "1", tradeDate: "1", price: "10", quantity: "100" },
      { ...base, id: 2, side: "BUY", tradeAt: "2", tradeDate: "2", price: "12", quantity: "100" },
      { ...base, id: 3, side: "SELL", tradeAt: "3", tradeDate: "3", price: "15", quantity: "150" },
      { ...base, id: 4, side: "SELL", tradeAt: "4", tradeDate: "4", price: "14", quantity: "50" },
    ] as Trade[];
    expect(pairTradesFifo(trades)).toEqual([
      { buyTradeId: 1, sellTradeId: 3, quantity: "100", allocatedBuyFee: "0.00", allocatedSellFee: "0.00", realizedPnl: "500.00" },
      { buyTradeId: 2, sellTradeId: 3, quantity: "50", allocatedBuyFee: "0.00", allocatedSellFee: "0.00", realizedPnl: "150.00" },
      { buyTradeId: 2, sellTradeId: 4, quantity: "50", allocatedBuyFee: "0.00", allocatedSellFee: "0.00", realizedPnl: "100.00" },
    ]);
  });
  it("allocates both buy and sell fees proportionally", () => {
    const base = { instrumentId: 1, accountId: 1, estimatedExitFee: "0", currency: "USD", strategyId: null, reason: "", plan: "", note: "", plannedStop: null, plannedTarget: null };
    const trades = [
      { ...base, id: 1, side: "BUY", tradeAt: "1", tradeDate: "1", price: "10", quantity: "100", fee: "10" },
      { ...base, id: 2, side: "SELL", tradeAt: "2", tradeDate: "2", price: "11", quantity: "50", fee: "5" },
    ] as Trade[];
    expect(pairTradesFifo(trades)[0]).toEqual({ buyTradeId: 1, sellTradeId: 2, quantity: "50", allocatedBuyFee: "5.00", allocatedSellFee: "5.00", realizedPnl: "40.00" });
  });
});

describe("fee-aware break-even", () => {
  it("includes both buy and estimated sell fees", () => {
    expect(calculateBreakEven({ price: "10", quantity: "100", buyFee: "5", estimatedSellFee: "5" })).toEqual({ investedAmount: "1005.00", roundTripFees: "10.00", breakEvenPrice: "10.1000", requiredMovePct: "1.0000" });
  });
  it("solves percentage, minimum, and fixed exit fees from sale proceeds", () => {
    const result = solveExitBreakEven({ requiredCash: "1000", quantity: "100", model: { ratePct: "0.1", minimum: "5", fixed: "2" } });
    expect(result?.fee.toFixed(2)).toBe("7.00");
    expect(result?.price.toDecimalPlaces(4).toFixed(4)).toBe("10.0700");
  });
});

describe("moving-average position cost", () => {
  const base = { instrumentId: 1, accountId: 1, currency: "USD", strategyId: null, reason: "", plan: "", note: "", plannedStop: null, plannedTarget: null };
  const trades = [
    { ...base, id: 1, side: "BUY", tradeAt: "1", tradeDate: "1", price: "100", quantity: "10", fee: "5", estimatedExitFee: "5" },
    { ...base, id: 2, side: "BUY", tradeAt: "2", tradeDate: "2", price: "120", quantity: "10", fee: "5", estimatedExitFee: "5" },
    { ...base, id: 3, side: "SELL", tradeAt: "3", tradeDate: "3", price: "130", quantity: "5", fee: "2", estimatedExitFee: "0" },
    { ...base, id: 4, side: "BUY", tradeAt: "4", tradeDate: "4", price: "90", quantity: "5", fee: "0", estimatedExitFee: "2" },
  ] as Trade[];

  it("recalculates the weighted position cost after every buy", () => {
    const afterSecondBuy = calculatePositionCostAtTrade(trades, 2);
    expect(afterSecondBuy).toMatchObject({ quantityAfter: "20", costBasisAfter: "2210.00", averageCostAfter: "110.5000", estimatedExitFeeAfter: "5.00", positionBreakEvenPriceAfter: "110.7500", campaignBreakEvenPriceAfter: "110.7500" });
  });

  it("uses the pre-sell average cost and actual sell fee for a sell break-even", () => {
    const afterSell = calculatePositionCostAtTrade(trades, 3);
    expect(afterSell).toMatchObject({ quantityBefore: "20", averageCostBefore: "110.5000", matchedSellQuantity: "5", sellBreakEvenPrice: "110.9000", realizedPnlAtAverageCost: "95.50", quantityAfter: "15", averageCostAfter: "110.5000", positionBreakEvenPriceAfter: "110.7500", campaignBreakEvenPriceAfter: "104.3834" });
  });

  it("does not let later trades change an earlier cost snapshot", () => {
    expect(calculatePositionCostAtTrade(trades, 2)).toEqual(calculatePositionCostAtTrade(trades.slice(0, 2), 2));
    expect(calculatePositionCostTimeline(trades)).toHaveLength(4);
  });

  it("carries a partial realized loss into the campaign recovery price", () => {
    const lossTrades = [
      { ...base, id: 10, side: "BUY", tradeAt: "1", tradeDate: "1", price: "10", quantity: "100", fee: "0", estimatedExitFee: "0" },
      { ...base, id: 11, side: "SELL", tradeAt: "2", tradeDate: "2", price: "8", quantity: "50", fee: "0", estimatedExitFee: "0" },
    ] as Trade[];
    expect(calculatePositionCostAtTrade(lossTrades, 11)).toMatchObject({ averageCostAfter: "10.0000", positionBreakEvenPriceAfter: "10.0000", campaignBreakEvenPriceAfter: "12.0000" });
  });

  it("keeps accounts isolated", () => {
    const accountTrades = [
      { ...base, id: 20, accountId: 1, side: "BUY", tradeAt: "1", tradeDate: "1", price: "10", quantity: "10", fee: "0", estimatedExitFee: "0" },
      { ...base, id: 21, accountId: 2, side: "BUY", tradeAt: "2", tradeDate: "2", price: "20", quantity: "10", fee: "0", estimatedExitFee: "0" },
    ] as Trade[];
    expect(calculatePositionCostAtTrade(accountTrades, 21)?.averageCostAfter).toBe("20.0000");
  });
});

describe("long-only validation", () => {
  it("rejects an oversell instead of silently discarding it", () => {
    const result = validateLongOnlyTimeline([
      { id: 1, instrumentId: 1, accountId: 1, side: "BUY", tradeAt: "1", quantity: "10" },
      { id: 2, instrumentId: 1, accountId: 1, side: "SELL", tradeAt: "2", quantity: "11" },
    ]);
    expect(result.valid).toBe(false);
  });
});

describe("closed campaign analytics", () => {
  it("combines scaled entries and exits into one fee-aware campaign", () => {
    const base = { instrumentId: 1, accountId: 1, currency: "USD", strategyId: null, strategy: "Manual", reason: "", plan: "", note: "", plannedStop: "9", plannedTarget: null, estimatedExitFee: "0" };
    const trades = [
      { ...base, id: 1, side: "BUY", tradeAt: "2026-01-01T10:00:00", tradeDate: "2026-01-01", price: "10", quantity: "50", fee: "5" },
      { ...base, id: 2, side: "BUY", tradeAt: "2026-01-02T10:00:00", tradeDate: "2026-01-02", price: "10", quantity: "50", fee: "5" },
      { ...base, id: 3, side: "SELL", tradeAt: "2026-01-10T10:00:00", tradeDate: "2026-01-10", price: "12", quantity: "100", fee: "10" },
    ] as Trade[];
    const campaigns = buildClosedCampaigns(trades);
    expect(campaigns).toHaveLength(1);
    expect(campaigns[0]).toMatchObject({ buyCount: 2, sellCount: 1, netPnl: 180 });
    expect(campaignMetrics(campaigns).winRate).toBe(100);
  });
});
