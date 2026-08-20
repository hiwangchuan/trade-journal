import { describe, expect, it, vi } from "vitest";
import { assembleAiStockAnalysis, parseAiStockAnalysis, parseAiStockAnalysisSection, requestAiStockAnalysis, requestAiStockAnalysisStream } from "../src/lib/ai/client";
import { extractServerSentEvents } from "../src/lib/ai/sse";
import { buildStockAnalysisInput } from "../src/lib/ai/stock-analysis";
import type { Candle, StockWorkspaceData, TradeWithAnalysis } from "../src/types";

const analysisJson = { summary: "样本有限。", marketObservations: [], positionReview: ["回本价已计入手续费。"], behaviorPatterns: [], watchItems: [], limitations: ["不包含新闻。"] };
const candles: Candle[] = Array.from({ length: 260 }, (_, index) => { const date = new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10); return { time: date, open: 100 + index, high: 102 + index, low: 99 + index, close: 101 + index, volume: 1000 + index }; });
const baseTrade = { instrumentId: 1, accountId: 1, currency: "USD", strategyId: null, strategy: "Manual", reason: "不要外发的理由", plan: "私人计划", note: "私人备注", plannedStop: null, plannedTarget: null, tags: [], snapshot: null, outcome: null };
const trades = [
  { ...baseTrade, id: 1, side: "BUY", tradeAt: "2025-01-02T10:00:00", tradeDate: "2025-01-02", price: "100", quantity: "10", fee: "5", estimatedExitFee: "5" },
  { ...baseTrade, id: 2, side: "BUY", tradeAt: "2025-01-03T10:00:00", tradeDate: "2025-01-03", price: "120", quantity: "10", fee: "5", estimatedExitFee: "5" },
] as TradeWithAnalysis[];
const workspace: StockWorkspaceData = { instrument: { id: 1, symbol: "TEST", name: "Test", exchange: "NYSE", market: "US", currency: "USD", timezone: "UTC", dataProvider: "csv", providerSymbol: "TEST", priceAdjustment: "raw", marketDataStale: false, lastMarketRefreshAt: null, exitFeeModel: { ratePct: "0", fixed: "0", minimum: "0" } }, candles, trades, manualLevels: [], updatedAt: candles.at(-1)!.time, marketData: null };

describe("AI stock analysis", () => {
  it("builds fee-aware structured input without free-form private notes", () => {
    const input = buildStockAnalysisInput(workspace);
    expect(input.positions[0]).toMatchObject({ quantity: "20", averageCost: "110.5000", campaignBreakEvenPrice: "110.7500" });
    expect(JSON.stringify(input)).not.toContain("不要外发");
    expect(input.dataScope).toMatchObject({ candleCount: 260, tradeCount: 2 });
  });

  it("keeps unavailable rolling ranges null instead of treating them as lows", () => {
    const input = buildStockAnalysisInput({ ...workspace, candles: candles.slice(0, 10), updatedAt: candles[9].time });
    expect(input.marketSnapshot.range20Pct).toBeNull();
    expect(input.marketSnapshot.range250Pct).toBeNull();
  });

  it("parses fenced structured model output", () => expect(parseAiStockAnalysis(`\`\`\`json\n${JSON.stringify(analysisJson)}\n\`\`\``)).toEqual(analysisJson));

  it("calls the OpenAI-compatible chat completions endpoint", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(analysisJson) } }] }), { status: 200, headers: { "content-type": "application/json" } }));
    await expect(requestAiStockAnalysis({ symbol: "TEST" }, { baseUrl: "https://example.test/api/openai/", model: "model-a", apiKey: "secret" }, fetcher as typeof fetch)).resolves.toEqual(analysisJson);
    expect(fetcher).toHaveBeenCalledWith("https://example.test/api/openai/chat/completions", expect.objectContaining({ method: "POST" }));
  });

  it("parses NDJSON sections and assembles the final structured analysis", () => {
    const lines = [
      '{"type":"summary","value":"样本有限。"}',
      '{"type":"positionReview","value":"回本价已计入手续费。"}',
      '{"type":"limitation","value":"不包含新闻。"}',
    ];
    const sections = lines.map(parseAiStockAnalysisSection).filter((section) => section !== null);
    expect(assembleAiStockAnalysis(sections)).toEqual(analysisJson);
    expect(parseAiStockAnalysisSection("not-json")).toBeNull();
  });

  it("handles SSE events split across browser network chunks", () => {
    const first = extractServerSentEvents('event: meta\ndata: {"model":"test"}\n\nevent: sec');
    expect(first.events).toEqual([{ event: "meta", data: '{"model":"test"}' }]);
    const second = extractServerSentEvents(`${first.rest}tion\r\ndata: {"type":"summary"}\r\n\r\n`);
    expect(second.events).toEqual([{ event: "section", data: '{"type":"summary"}' }]);
    expect(second.rest).toBe("");
  });

  it("streams OpenAI-compatible deltas and validates the completed report", async () => {
    const chunks = [
      '{"type":"summary","value":"样本有限。"}\n',
      '{"type":"positionReview","value":"回本价已计入手续费。"}\n',
      '{"type":"limitation","value":"不包含新闻。"}',
    ];
    const sse = `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: "内部推理不展示" } }] })}\n\n` + chunks.map((content) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`).join("") + "data: [DONE]\n\n";
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { stream: boolean };
      expect(body.stream).toBe(true);
      return new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } });
    });
    const received: string[] = [];
    const progress: number[] = [];
    await expect(requestAiStockAnalysisStream(
      { symbol: "TEST" },
      { baseUrl: "https://example.test/api/openai", model: "model-a", apiKey: "secret" },
      { onSection: (section) => received.push(section.type), onDelta: (characters) => progress.push(characters) },
      fetcher as typeof fetch,
    )).resolves.toEqual(analysisJson);
    expect(received).toEqual(["summary", "positionReview", "limitation"]);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
  });
});
