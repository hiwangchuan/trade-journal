import { atr } from "@/lib/analysis/atr";
import { buildClosedCampaigns, campaignMetrics } from "@/lib/analysis/campaign-analysis";
import { sma } from "@/lib/analysis/moving-average";
import { findConfirmedPivots, nearestPivots } from "@/lib/analysis/pivot";
import { rollingRange } from "@/lib/analysis/rolling-range";
import { volumeContext } from "@/lib/analysis/volume";
import { calculatePositionCostTimeline } from "@/lib/trades/position-cost";
import type { Candle, StockWorkspaceData, TradeWithAnalysis } from "@/types";

const rounded = (value: number | null, digits = 4) => value === null || !Number.isFinite(value) ? null : Number(value.toFixed(digits));
const mean = (values: Array<number | null | undefined>) => {
  const available = values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
  return available.length ? available.reduce((sum, value) => sum + value, 0) / available.length : null;
};

function sessionReturn(candles: Candle[], sessions: number) {
  if (candles.length <= sessions) return null;
  const current = candles.at(-1)!.close;
  const previous = candles.at(-(sessions + 1))!.close;
  return previous > 0 ? ((current / previous) - 1) * 100 : null;
}

function tradePattern(trades: TradeWithAnalysis[]) {
  const buys = trades.filter((trade) => trade.side === "BUY");
  const sells = trades.filter((trade) => trade.side === "SELL");
  return {
    tradeCount: trades.length,
    buyCount: buys.length,
    sellCount: sells.length,
    averageBuyRange60Pct: rounded(mean(buys.map((trade) => trade.snapshot?.range60Percentile === null || trade.snapshot?.range60Percentile === undefined ? null : trade.snapshot.range60Percentile * 100)), 2),
    averageBuyDistanceToMa20Pct: rounded(mean(buys.map((trade) => trade.snapshot?.distanceToMa20Pct)), 2),
    averageBuyReturn20dPct: rounded(mean(buys.map((trade) => trade.outcome?.return20d)), 2),
    averageBuyMfe20dPct: rounded(mean(buys.map((trade) => trade.outcome?.mfe20d)), 2),
    averageBuyMae20dPct: rounded(mean(buys.map((trade) => trade.outcome?.mae20d)), 2),
    completedBuyOutcomeCount: buys.filter((trade) => trade.outcome?.return20d !== null && trade.outcome?.return20d !== undefined).length,
  };
}

function currentPositions(data: StockWorkspaceData) {
  const tradeById = new Map(data.trades.map((trade) => [trade.id, trade]));
  const latestByAccount = new Map<number, ReturnType<typeof calculatePositionCostTimeline>[number]>();
  for (const snapshot of calculatePositionCostTimeline(data.trades, data.instrument.exitFeeModel)) {
    const accountId = tradeById.get(snapshot.tradeId)?.accountId;
    if (accountId !== undefined) latestByAccount.set(accountId, snapshot);
  }
  return [...latestByAccount.entries()].flatMap(([accountId, snapshot]) => Number(snapshot.quantityAfter) > 0 ? [{
    accountId,
    quantity: snapshot.quantityAfter,
    averageCost: snapshot.averageCostAfter,
    positionBreakEvenPrice: snapshot.positionBreakEvenPriceAfter,
    campaignBreakEvenPrice: snapshot.campaignBreakEvenPriceAfter,
    estimatedExitFee: snapshot.estimatedExitFeeAfter,
    campaignNetCashOutflow: snapshot.campaignNetCashOutflowAfter,
    campaignNumber: snapshot.campaignNumber,
  }] : []);
}

export function buildStockAnalysisInput(data: StockWorkspaceData) {
  const { candles, trades, instrument } = data;
  const current = candles.at(-1) ?? null;
  const currentPrice = current?.close ?? null;
  const rangePercent = (window: number) => {
    if (currentPrice === null) return null;
    const range = rollingRange(candles, currentPrice, window);
    return range ? rounded(range.percentile * 100, 2) : null;
  };
  const ranges = { range20Pct: rangePercent(20), range60Pct: rangePercent(60), range120Pct: rangePercent(120), range250Pct: rangePercent(250) };
  const ma20 = sma(candles, 20);
  const ma60 = sma(candles, 60);
  const atr14 = atr(candles, 14);
  const volume = volumeContext(candles, 20);
  const activeDates = new Set(candles.slice(-120).map((candle) => candle.time));
  const pivots = currentPrice === null ? { high: null, low: null } : nearestPivots(findConfirmedPivots(candles).filter((pivot) => activeDates.has(pivot.date)), currentPrice);
  const campaigns = buildClosedCampaigns(trades);
  const campaignSummary = campaignMetrics(campaigns);
  const limitations = [
    candles.length < 250 ? `K线仅有 ${candles.length} 根，长期区间结论样本不足。` : null,
    campaigns.length < 20 ? `完整持仓周期仅 ${campaigns.length} 个，不足以判断稳定策略优势。` : null,
    trades.filter((trade) => trade.side === "SELL").length === 0 ? "尚无卖出记录，无法评价实际平仓质量。" : null,
    "输入不包含新闻、财报、宏观数据或盘中价格。",
  ].filter((item): item is string => Boolean(item));

  return {
    schemaVersion: "1.0",
    instrument: { symbol: instrument.symbol, name: instrument.name, exchange: instrument.exchange, market: instrument.market, currency: instrument.currency },
    dataScope: { candleCount: candles.length, earliestDate: candles[0]?.time ?? null, asOfDate: current?.time ?? null, tradeCount: trades.length },
    marketSnapshot: {
      currentPrice,
      return1SessionPct: rounded(sessionReturn(candles, 1), 2),
      return5SessionPct: rounded(sessionReturn(candles, 5), 2),
      return20SessionPct: rounded(sessionReturn(candles, 20), 2),
      return60SessionPct: rounded(sessionReturn(candles, 60), 2),
      ma20: rounded(ma20),
      ma60: rounded(ma60),
      distanceToMa20Pct: currentPrice !== null && ma20 ? rounded(((currentPrice / ma20) - 1) * 100, 2) : null,
      distanceToMa60Pct: currentPrice !== null && ma60 ? rounded(((currentPrice / ma60) - 1) * 100, 2) : null,
      atr14: rounded(atr14),
      atrPct: currentPrice !== null && atr14 !== null ? rounded(atr14 / currentPrice * 100, 2) : null,
      volumeRatio20: rounded(volume.ratio, 2),
      ...ranges,
      nearestResistance: rounded(pivots.high?.price ?? null),
      nearestSupport: rounded(pivots.low?.price ?? null),
    },
    positions: currentPositions(data),
    campaignSummary: {
      count: campaignSummary.count,
      winRatePct: rounded(campaignSummary.winRate, 2),
      averageReturnPct: rounded(campaignSummary.averageReturnPct, 2),
      profitFactor: campaignSummary.profitFactor === Infinity ? "Infinity" : rounded(campaignSummary.profitFactor, 2),
      averageR: rounded(campaignSummary.averageR, 2),
      rSampleCount: campaignSummary.rSampleCount,
      averageHoldingDays: rounded(campaignSummary.averageHoldingDays, 2),
      maxDrawdown: rounded(campaignSummary.maxDrawdown, 2),
    },
    tradePattern: tradePattern(trades),
    recentTrades: [...trades].sort((a, b) => b.tradeAt.localeCompare(a.tradeAt)).slice(0, 20).map((trade) => ({
      date: trade.tradeDate,
      side: trade.side,
      price: Number(trade.price),
      quantity: Number(trade.quantity),
      fee: Number(trade.fee),
      strategy: trade.strategy ?? "Manual",
      range60Pct: rounded(trade.snapshot?.range60Percentile === null || trade.snapshot?.range60Percentile === undefined ? null : trade.snapshot.range60Percentile * 100, 2),
      distanceToMa20Pct: rounded(trade.snapshot?.distanceToMa20Pct ?? null, 2),
      return20dPct: rounded(trade.outcome?.return20d ?? null, 2),
      mfe20dPct: rounded(trade.outcome?.mfe20d ?? null, 2),
      mae20dPct: rounded(trade.outcome?.mae20d ?? null, 2),
    })),
    manualLevels: data.manualLevels.map((level) => ({ type: level.type, price: level.price, label: level.label })),
    limitations,
  };
}
