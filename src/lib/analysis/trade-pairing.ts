import Decimal from "decimal.js";
import type { Trade } from "@/types";

export type Pair = { buyTradeId: number; sellTradeId: number; quantity: string; allocatedBuyFee: string; allocatedSellFee: string; realizedPnl: string };

export function pairTradesFifo(trades: Trade[]): Pair[] {
  const groups = new Map<string, Trade[]>();
  for (const trade of trades) {
    const key = `${trade.instrumentId}:${trade.accountId}`;
    const group = groups.get(key) ?? [];
    group.push(trade);
    groups.set(key, group);
  }
  return [...groups.values()].flatMap(pairGroup);
}

function pairGroup(trades: Trade[]): Pair[] {
  const queue: Array<{ trade: Trade; remaining: Decimal }> = [];
  const pairs: Pair[] = [];
  for (const trade of [...trades].sort((a, b) => a.tradeAt.localeCompare(b.tradeAt) || a.id - b.id)) {
    if (trade.side === "BUY") { queue.push({ trade, remaining: new Decimal(trade.quantity) }); continue; }
    let remainingSell = new Decimal(trade.quantity);
    while (remainingSell.gt(0) && queue.length) {
      const lot = queue[0];
      const matched = Decimal.min(remainingSell, lot.remaining);
      const allocatedBuyFee = new Decimal(lot.trade.fee).times(matched).div(lot.trade.quantity);
      const allocatedSellFee = new Decimal(trade.fee).times(matched).div(trade.quantity);
      const pnl = new Decimal(trade.price).minus(lot.trade.price).times(matched).minus(allocatedBuyFee).minus(allocatedSellFee);
      pairs.push({ buyTradeId: lot.trade.id, sellTradeId: trade.id, quantity: matched.toString(), allocatedBuyFee: allocatedBuyFee.toFixed(2), allocatedSellFee: allocatedSellFee.toFixed(2), realizedPnl: pnl.toFixed(2) });
      remainingSell = remainingSell.minus(matched); lot.remaining = lot.remaining.minus(matched);
      if (lot.remaining.eq(0)) queue.shift();
    }
    if (remainingSell.gt(0)) throw new Error(`交易 ${trade.id} 的卖出数量超过可用持仓。`);
  }
  return pairs;
}
