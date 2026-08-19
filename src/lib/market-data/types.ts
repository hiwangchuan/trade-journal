import type { Candle, PriceAdjustment } from "@/types";

export type InstrumentSearchResult = { symbol: string; name: string; exchange: string; currency: string };
export interface MarketDataProvider {
  searchInstruments(query: string): Promise<InstrumentSearchResult[]>;
  getCandles(params: { symbol: string; interval: "1day"; adjustment?: PriceAdjustment; start?: string; end?: string }): Promise<Candle[]>;
}

export type MarketDataErrorCode = "AUTH" | "RATE_LIMIT" | "SYMBOL_NOT_FOUND" | "PLAN_RESTRICTED" | "NETWORK" | "INVALID_RESPONSE" | "UNKNOWN";
export class MarketDataError extends Error {
  constructor(public code: MarketDataErrorCode, message: string) { super(message); this.name = "MarketDataError"; }
}

export function validateCandles(candles: Candle[]) {
  const dates = new Set<string>();
  for (const candle of candles) {
    const prices = [candle.open, candle.high, candle.low, candle.close];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(candle.time) || prices.some((value) => !Number.isFinite(value) || value <= 0) || !Number.isFinite(candle.volume) || candle.volume < 0) {
      throw new MarketDataError("INVALID_RESPONSE", `${candle.time || "未知日期"} 的 K 线包含无效价格或成交量。`);
    }
    if (candle.high < Math.max(candle.open, candle.close) || candle.low > Math.min(candle.open, candle.close) || candle.high < candle.low) {
      throw new MarketDataError("INVALID_RESPONSE", `${candle.time} 的 OHLC 高低价关系无效。`);
    }
    if (dates.has(candle.time)) throw new MarketDataError("INVALID_RESPONSE", `${candle.time} 存在重复 K 线。`);
    dates.add(candle.time);
  }
  return [...candles].sort((a, b) => a.time.localeCompare(b.time));
}
