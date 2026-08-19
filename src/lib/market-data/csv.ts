import type { Candle } from "@/types";
import type { InstrumentSearchResult, MarketDataProvider } from "./types";
import { MarketDataError, validateCandles } from "./types";

export function parseOhlcvCsv(input: string): Candle[] {
  const lines = input.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new MarketDataError("INVALID_RESPONSE", "CSV must contain a header and at least one data row.");
  const headers = lines[0].split(",").map((value) => value.trim().toLowerCase());
  const required = ["date", "open", "high", "low", "close", "volume"];
  if (!required.every((field) => headers.includes(field))) throw new MarketDataError("INVALID_RESPONSE", "CSV header must include date, open, high, low, close, volume.");
  return validateCandles(lines.slice(1).map((line, lineIndex) => {
    const values = line.split(",").map((value) => value.trim());
    const value = (field: string) => values[headers.indexOf(field)];
    const candle = { time: value("date"), open: Number(value("open")), high: Number(value("high")), low: Number(value("low")), close: Number(value("close")), volume: Number(value("volume")), source: "csv" };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(candle.time) || [candle.open, candle.high, candle.low, candle.close, candle.volume].some(Number.isNaN)) throw new MarketDataError("INVALID_RESPONSE", `Invalid CSV row ${lineIndex + 2}.`);
    return candle;
  }));
}

export class CsvProvider implements MarketDataProvider {
  constructor(private input = "") {}
  async searchInstruments(): Promise<InstrumentSearchResult[]> { return []; }
  async getCandles() { return parseOhlcvCsv(this.input); }
}
