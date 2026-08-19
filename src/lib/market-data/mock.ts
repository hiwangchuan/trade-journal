import type { Candle } from "@/types";
import type { InstrumentSearchResult, MarketDataProvider } from "./types";

export const mockInstruments: InstrumentSearchResult[] = [];

function hashSymbol(symbol: string) { return [...symbol].reduce((sum, char) => sum + char.charCodeAt(0), 0); }

export function generateMockCandles(symbol: string, count = 760, endDate = "2026-08-18"): Candle[] {
  const seed = hashSymbol(symbol);
  let date = new Date(`${endDate}T12:00:00Z`);
  const dates: string[] = [];
  while (dates.length < count) {
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) dates.push(date.toISOString().slice(0, 10));
    date.setUTCDate(date.getUTCDate() - 1);
  }
  dates.reverse();
  const base = symbol === "01810.HK" ? 24 : symbol === "QQQ" ? 285 : symbol === "NOK" ? 4.2 : 50;
  let close = base;
  return dates.map((time, index) => {
    const wave = Math.sin((index + seed) / 17) * 0.011 + Math.sin((index + seed) / 61) * 0.006;
    const drift = symbol === "01810.HK" ? 0.00115 : symbol === "QQQ" ? 0.0005 : symbol === "NOK" ? 0.0002 : 0.0004;
    const shock = Math.sin(index * 12.9898 + seed) * 0.006;
    const open = close * (1 + Math.sin(index * 7.31 + seed) * 0.004);
    close = Math.max(2, close * (1 + drift + wave + shock));
    const spread = close * (0.012 + Math.abs(Math.cos(index * 1.93)) * 0.012);
    const baseVolume = symbol === "01810.HK" ? 38_000_000 : symbol === "QQQ" ? 42_000_000 : symbol === "NOK" ? 18_000_000 : 10_000_000;
    const volume = Math.round(baseVolume * (0.65 + Math.abs(Math.sin(index * 0.73 + seed)) * 0.9));
    return { time, open: +open.toFixed(2), high: +(Math.max(open, close) + spread).toFixed(2), low: +(Math.min(open, close) - spread).toFixed(2), close: +close.toFixed(2), volume, source: "mock" };
  });
}

export class MockProvider implements MarketDataProvider {
  async searchInstruments(query: string) { const normalized = query.toLowerCase(); return mockInstruments.filter((item) => `${item.symbol} ${item.name}`.toLowerCase().includes(normalized)); }
  async getCandles({ symbol, adjustment = "raw" }: { symbol: string; interval: "1day"; adjustment?: "raw" | "splits" }) { return generateMockCandles(symbol).map((candle) => ({ ...candle, adjustment })); }
}
