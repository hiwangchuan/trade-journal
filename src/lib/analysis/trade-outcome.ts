import type { Candle, Trade, TradeOutcome } from "@/types";

export function calculateTradeOutcome(trade: Pick<Trade, "id" | "side" | "price" | "tradeDate">, candles: Candle[]): TradeOutcome {
  const future = candles.filter((candle) => candle.time > trade.tradeDate);
  const price = Number(trade.price);
  const closeReturn = (days: number) => future.length < days ? null : ((future[days - 1].close / price) - 1) * 100;
  const excursion = (days: number) => {
    if (future.length < days) return { mfe: null, mae: null, maxHigh: null, minLow: null };
    const slice = future.slice(0, days);
    const maxHigh = Math.max(...slice.map((candle) => candle.high));
    const minLow = Math.min(...slice.map((candle) => candle.low));
    return { mfe: ((maxHigh / price) - 1) * 100, mae: ((minLow / price) - 1) * 100, maxHigh, minLow };
  };
  const five = excursion(5), twenty = excursion(20);
  return {
    tradeId: trade.id, return1d: closeReturn(1), return3d: closeReturn(3), return5d: closeReturn(5), return10d: closeReturn(10), return20d: closeReturn(20), return60d: closeReturn(60),
    mfe5d: five.mfe, mae5d: five.mae, mfe20d: twenty.mfe, mae20d: twenty.mae, maxHigh20d: twenty.maxHigh, minLow20d: twenty.minLow,
    sellMissedGain20d: trade.side === "SELL" && twenty.maxHigh !== null ? ((twenty.maxHigh / price) - 1) * 100 : null,
    calculatedThrough: future.at(-1)?.time ?? null,
  };
}
