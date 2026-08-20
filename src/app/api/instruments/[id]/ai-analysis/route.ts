import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { getAiConfiguration, requestAiStockAnalysis } from "@/lib/ai/client";
import { buildStockAnalysisInput } from "@/lib/ai/stock-analysis";
import { getWorkspace } from "@/lib/data";

export const runtime = "nodejs";

type CacheEntry = { expiresAt: number; analysis: Awaited<ReturnType<typeof requestAiStockAnalysis>>; generatedAt: string };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000;

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const instrumentId = Number((await params).id);
  if (!Number.isInteger(instrumentId) || instrumentId <= 0) return NextResponse.json({ message: "股票ID无效。" }, { status: 400 });
  const configuration = getAiConfiguration();
  if (!configuration) return NextResponse.json({ message: "AI服务尚未配置，请设置 AI_BASE_URL、AI_MODEL 和 AI_API_KEY。" }, { status: 503 });
  const instrument = sqlite.prepare("SELECT symbol FROM instruments WHERE id=?").get(instrumentId) as { symbol: string } | undefined;
  const workspace = instrument ? getWorkspace(instrument.symbol) : null;
  if (!workspace) return NextResponse.json({ message: "未找到该股票。" }, { status: 404 });

  const input = buildStockAnalysisInput(workspace);
  const fingerprint = createHash("sha256").update(JSON.stringify({ model: configuration.model, input })).digest("hex");
  const cached = cache.get(fingerprint);
  if (cached && cached.expiresAt > Date.now()) return NextResponse.json({ analysis: cached.analysis, model: configuration.model, generatedAt: cached.generatedAt, cached: true, context: input.dataScope });

  try {
    const analysis = await requestAiStockAnalysis(input, configuration);
    const generatedAt = new Date().toISOString();
    cache.set(fingerprint, { analysis, generatedAt, expiresAt: Date.now() + CACHE_TTL_MS });
    return NextResponse.json({ analysis, model: configuration.model, generatedAt, cached: false, context: input.dataScope });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "AI分析失败，请稍后重试。";
    console.error("AI stock analysis failed:", message);
    return NextResponse.json({ message }, { status: 502 });
  }
}
