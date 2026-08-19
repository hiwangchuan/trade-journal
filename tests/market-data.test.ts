import { describe, expect, it } from "vitest";
import { classifyTwelveDataError } from "../src/lib/market-data/twelve-data";
import { classifyEodhdError } from "../src/lib/market-data/eodhd";
import { validateCandles } from "../src/lib/market-data/types";

describe("Twelve Data error mapping", () => {
  it("keeps authentication errors as 401-class errors", () => {
    expect(classifyTwelveDataError(401, "Invalid API key")).toBe("AUTH");
  });

  it("keeps plan errors as permission errors", () => {
    expect(classifyTwelveDataError(403, "Your plan does not support this endpoint")).toBe("PLAN_RESTRICTED");
  });

  it("identifies unavailable symbols and rate limits", () => {
    expect(classifyTwelveDataError(404, "Symbol not found")).toBe("SYMBOL_NOT_FOUND");
    expect(classifyTwelveDataError(429, "Too many requests")).toBe("RATE_LIMIT");
  });

  it("keeps invalid parameters distinct from network failures", () => {
    expect(classifyTwelveDataError(400, "Invalid interval")).toBe("INVALID_RESPONSE");
    expect(classifyTwelveDataError(500, "Internal error")).toBe("NETWORK");
  });
});

describe("EODHD error mapping", () => {
  it("identifies authentication, plan, symbol, and rate-limit errors", () => {
    expect(classifyEodhdError(401, "Invalid API token")).toBe("AUTH");
    expect(classifyEodhdError(403, "Forbidden by your plan")).toBe("PLAN_RESTRICTED");
    expect(classifyEodhdError(404, "Unknown ticker")).toBe("SYMBOL_NOT_FOUND");
    expect(classifyEodhdError(429, "Daily limit exceeded")).toBe("RATE_LIMIT");
  });

  it("keeps provider and network failures distinct", () => {
    expect(classifyEodhdError(400, "Invalid parameter")).toBe("INVALID_RESPONSE");
    expect(classifyEodhdError(503, "Unavailable")).toBe("NETWORK");
  });
});

describe("market data validation", () => {
  it("rejects impossible OHLC relationships", () => {
    expect(() => validateCandles([{ time: "2026-01-01", open: 10, high: 9, low: 8, close: 10, volume: 1, source: "test", adjustment: "raw" }])).toThrow(/OHLC/);
  });

  it("rejects duplicate dates before replacing the active dataset", () => {
    const candle = { time: "2026-01-01", open: 10, high: 11, low: 9, close: 10, volume: 1, source: "test", adjustment: "splits" as const };
    expect(() => validateCandles([candle, candle])).toThrow(/重复/);
  });
});
