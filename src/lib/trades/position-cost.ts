import Decimal from "decimal.js";
import type { ExitFeeModel, Trade } from "@/types";
import { solveExitBreakEven } from "./fees";

type CostTrade = Pick<Trade, "id" | "instrumentId" | "accountId" | "side" | "tradeAt" | "price" | "quantity" | "fee" | "estimatedExitFee">;

export type PositionCostSnapshot = {
  tradeId: number;
  side: "BUY" | "SELL";
  quantityBefore: string;
  averageCostBefore: string | null;
  quantityAfter: string;
  costBasisAfter: string;
  averageCostAfter: string | null;
  estimatedExitFeeAfter: string;
  positionBreakEvenPriceAfter: string | null;
  positionRequiredMovePctAfter: string | null;
  campaignBreakEvenPriceAfter: string | null;
  campaignRequiredMovePctAfter: string | null;
  campaignNetCashOutflowAfter: string;
  campaignCapitalRecoveredAfter: boolean;
  campaignNumber: number;
  campaignClosedPnl: string | null;
  matchedSellQuantity: string | null;
  sellBreakEvenPrice: string | null;
  sellPriceVsBreakEvenPct: string | null;
  realizedPnlAtAverageCost: string | null;
};

const zero = new Decimal(0);
const toMoney = (value: Decimal) => value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
const toQuantity = (value: Decimal) => value.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4).replace(/\.?0+$/, "");
const toPrice = (value: Decimal) => value.toDecimalPlaces(4, Decimal.ROUND_CEIL).toFixed(4);

function calculateGroupTimeline(trades: CostTrade[], exitFeeModel?: ExitFeeModel | null): PositionCostSnapshot[] {
  let quantity = zero;
  let costBasis = zero;
  let fallbackExitFee = zero;
  let campaignNetCashOutflow = zero;
  let campaignNumber = 1;
  const snapshots: PositionCostSnapshot[] = [];

  const ordered = [...trades].sort((a, b) => a.tradeAt.localeCompare(b.tradeAt) || a.id - b.id);
  for (const trade of ordered) {
    const price = new Decimal(trade.price || 0);
    const tradeQuantity = new Decimal(trade.quantity || 0);
    const fee = new Decimal(trade.fee || 0);
    const averageCostBefore = quantity.gt(0) ? costBasis.div(quantity) : null;
    const quantityBefore = quantity;
    let matchedSellQuantity: Decimal | null = null;
    let sellBreakEvenPrice: Decimal | null = null;
    let sellPriceVsBreakEvenPct: Decimal | null = null;
    let realizedPnlAtAverageCost: Decimal | null = null;
    let campaignClosedPnl: Decimal | null = null;

    if (trade.side === "BUY" && price.gt(0) && tradeQuantity.gt(0)) {
      costBasis = costBasis.plus(price.times(tradeQuantity)).plus(fee);
      campaignNetCashOutflow = campaignNetCashOutflow.plus(price.times(tradeQuantity)).plus(fee);
      fallbackExitFee = new Decimal(trade.estimatedExitFee || 0);
      quantity = quantity.plus(tradeQuantity);
    } else if (trade.side === "SELL" && price.gt(0) && tradeQuantity.gt(0) && quantity.gt(0) && averageCostBefore) {
      matchedSellQuantity = Decimal.min(tradeQuantity, quantity);
      const positionFraction = matchedSellQuantity.div(quantity);
      const allocatedSellFee = fee.times(matchedSellQuantity).div(tradeQuantity);
      sellBreakEvenPrice = averageCostBefore.plus(allocatedSellFee.div(matchedSellQuantity));
      sellPriceVsBreakEvenPct = price.div(sellBreakEvenPrice).minus(1).times(100);
      realizedPnlAtAverageCost = price.minus(averageCostBefore).times(matchedSellQuantity).minus(allocatedSellFee);
      campaignNetCashOutflow = campaignNetCashOutflow.minus(price.times(matchedSellQuantity).minus(allocatedSellFee));
      costBasis = costBasis.times(new Decimal(1).minus(positionFraction));
      fallbackExitFee = fallbackExitFee.times(new Decimal(1).minus(positionFraction));
      quantity = quantity.minus(matchedSellQuantity);
      if (quantity.abs().lt("0.00000001")) {
        campaignClosedPnl = campaignNetCashOutflow.negated();
        quantity = zero;
        costBasis = zero;
        fallbackExitFee = zero;
      }
    }

    const averageCostAfter = quantity.gt(0) ? costBasis.div(quantity) : null;
    const accountingSolution = quantity.gt(0) ? solveExitBreakEven({ requiredCash: costBasis, quantity, model: exitFeeModel, fallbackFee: fallbackExitFee }) : null;
    const campaignCapitalRecoveredAfter = quantity.gt(0) && campaignNetCashOutflow.lte(0);
    const campaignSolution = quantity.gt(0) ? solveExitBreakEven({ requiredCash: campaignNetCashOutflow, quantity, model: exitFeeModel, fallbackFee: fallbackExitFee }) : null;
    const positionBreakEven = accountingSolution?.price ?? null;
    const campaignBreakEven = campaignSolution?.price ?? null;
    const requiredMove = averageCostAfter && positionBreakEven
      ? positionBreakEven.div(averageCostAfter).minus(1).times(100)
      : null;
    const campaignRequiredMove = averageCostAfter && campaignBreakEven
      ? campaignBreakEven.div(averageCostAfter).minus(1).times(100)
      : null;

    snapshots.push({
      tradeId: trade.id,
      side: trade.side,
      quantityBefore: toQuantity(quantityBefore),
      averageCostBefore: averageCostBefore ? toPrice(averageCostBefore) : null,
      quantityAfter: toQuantity(quantity),
      costBasisAfter: toMoney(costBasis),
      averageCostAfter: averageCostAfter ? toPrice(averageCostAfter) : null,
      estimatedExitFeeAfter: toMoney(campaignSolution?.fee ?? zero),
      positionBreakEvenPriceAfter: positionBreakEven ? toPrice(positionBreakEven) : null,
      positionRequiredMovePctAfter: requiredMove ? requiredMove.toFixed(4) : null,
      campaignBreakEvenPriceAfter: campaignBreakEven ? toPrice(campaignBreakEven) : null,
      campaignRequiredMovePctAfter: campaignRequiredMove ? campaignRequiredMove.toFixed(4) : null,
      campaignNetCashOutflowAfter: toMoney(campaignNetCashOutflow),
      campaignCapitalRecoveredAfter,
      campaignNumber,
      campaignClosedPnl: campaignClosedPnl ? toMoney(campaignClosedPnl) : null,
      matchedSellQuantity: matchedSellQuantity ? toQuantity(matchedSellQuantity) : null,
      sellBreakEvenPrice: sellBreakEvenPrice ? toPrice(sellBreakEvenPrice) : null,
      sellPriceVsBreakEvenPct: sellPriceVsBreakEvenPct ? sellPriceVsBreakEvenPct.toFixed(4) : null,
      realizedPnlAtAverageCost: realizedPnlAtAverageCost ? toMoney(realizedPnlAtAverageCost) : null,
    });
    if (campaignClosedPnl) {
      campaignNetCashOutflow = zero;
      campaignNumber += 1;
    }
  }

  return snapshots;
}

export function calculatePositionCostTimeline(trades: CostTrade[], exitFeeModel?: ExitFeeModel | null): PositionCostSnapshot[] {
  const groups = new Map<string, CostTrade[]>();
  const tradeById = new Map(trades.map((trade) => [trade.id, trade]));
  for (const trade of trades) {
    const key = `${trade.instrumentId}:${trade.accountId}`;
    const group = groups.get(key) ?? [];
    group.push(trade);
    groups.set(key, group);
  }
  return [...groups.values()].flatMap((group) => calculateGroupTimeline(group, exitFeeModel)).sort((a, b) => {
    const left = tradeById.get(a.tradeId)!;
    const right = tradeById.get(b.tradeId)!;
    return left.tradeAt.localeCompare(right.tradeAt) || left.id - right.id;
  });
}

export function calculatePositionCostAtTrade(trades: CostTrade[], tradeId: number, exitFeeModel?: ExitFeeModel | null) {
  return calculatePositionCostTimeline(trades, exitFeeModel).find((snapshot) => snapshot.tradeId === tradeId) ?? null;
}
