import Decimal from "decimal.js";
import type { Trade } from "@/types";

export type ClosedCampaign = {
  instrumentId: number;
  accountId: number;
  campaignNumber: number;
  openedAt: string;
  closedAt: string;
  buyCount: number;
  sellCount: number;
  strategy: string;
  invested: number;
  netPnl: number;
  returnPct: number;
  initialRisk: number | null;
  rMultiple: number | null;
  holdingDays: number;
};

export function buildClosedCampaigns(trades: Trade[]): ClosedCampaign[] {
  const groups = new Map<string, Trade[]>();
  for (const trade of trades) {
    const key = `${trade.instrumentId}:${trade.accountId}`;
    const group = groups.get(key) ?? [];
    group.push(trade);
    groups.set(key, group);
  }
  return [...groups.values()].flatMap(buildGroupCampaigns).sort((a, b) => a.closedAt.localeCompare(b.closedAt));
}

function buildGroupCampaigns(trades: Trade[]) {
  const ordered = [...trades].sort((a, b) => a.tradeAt.localeCompare(b.tradeAt) || a.id - b.id);
  const campaigns: ClosedCampaign[] = [];
  let quantity = new Decimal(0);
  let buyCost = new Decimal(0);
  let sellProceeds = new Decimal(0);
  let initialRisk = new Decimal(0);
  let riskKnown = false;
  let openedAt = "";
  let buyCount = 0;
  let sellCount = 0;
  let campaignNumber = 1;
  const strategies = new Set<string>();

  for (const trade of ordered) {
    const tradeQuantity = new Decimal(trade.quantity);
    const gross = new Decimal(trade.price).times(tradeQuantity);
    const fee = new Decimal(trade.fee);
    if (trade.side === "BUY") {
      if (quantity.eq(0)) openedAt = trade.tradeAt;
      quantity = quantity.plus(tradeQuantity);
      buyCost = buyCost.plus(gross).plus(fee);
      buyCount += 1;
      strategies.add(trade.strategy ?? "Manual");
      if (trade.plannedStop) {
        const stopRisk = new Decimal(trade.price).minus(trade.plannedStop).times(tradeQuantity);
        if (stopRisk.gt(0)) { initialRisk = initialRisk.plus(stopRisk).plus(fee); riskKnown = true; }
      }
      continue;
    }

    if (tradeQuantity.gt(quantity)) throw new Error(`交易 ${trade.id} 的卖出数量超过可用持仓。`);
    quantity = quantity.minus(tradeQuantity);
    sellProceeds = sellProceeds.plus(gross).minus(fee);
    sellCount += 1;
    if (!quantity.eq(0)) continue;

    const pnl = sellProceeds.minus(buyCost);
    const holdingDays = Math.max(0, Math.round((new Date(trade.tradeAt).getTime() - new Date(openedAt).getTime()) / 86_400_000));
    campaigns.push({
      instrumentId: trade.instrumentId,
      accountId: trade.accountId,
      campaignNumber,
      openedAt,
      closedAt: trade.tradeAt,
      buyCount,
      sellCount,
      strategy: strategies.size === 1 ? [...strategies][0] : "混合策略",
      invested: buyCost.toNumber(),
      netPnl: pnl.toNumber(),
      returnPct: pnl.div(buyCost).times(100).toNumber(),
      initialRisk: riskKnown ? initialRisk.toNumber() : null,
      rMultiple: riskKnown && initialRisk.gt(0) ? pnl.div(initialRisk).toNumber() : null,
      holdingDays,
    });
    campaignNumber += 1;
    buyCost = new Decimal(0); sellProceeds = new Decimal(0); initialRisk = new Decimal(0); riskKnown = false; openedAt = ""; buyCount = 0; sellCount = 0; strategies.clear();
  }
  return campaigns;
}

export function campaignMetrics(campaigns: ClosedCampaign[]) {
  const wins = campaigns.filter((campaign) => campaign.netPnl > 0);
  const losses = campaigns.filter((campaign) => campaign.netPnl < 0);
  const rValues = campaigns.flatMap((campaign) => campaign.rMultiple === null ? [] : [campaign.rMultiple]);
  const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const campaign of campaigns) {
    cumulative += campaign.netPnl;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
  }
  const grossProfit = wins.reduce((sum, campaign) => sum + campaign.netPnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, campaign) => sum + campaign.netPnl, 0));
  return {
    count: campaigns.length,
    winRate: campaigns.length ? wins.length / campaigns.length * 100 : null,
    averageReturnPct: mean(campaigns.map((campaign) => campaign.returnPct)),
    expectancyPct: mean(campaigns.map((campaign) => campaign.returnPct)),
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : null,
    averageR: mean(rValues),
    rSampleCount: rValues.length,
    averageHoldingDays: mean(campaigns.map((campaign) => campaign.holdingDays)),
    maxDrawdown,
  };
}
