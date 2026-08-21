import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import {
  getAiConfiguration,
  requestAiStockAnalysis,
  requestAiStockAnalysisStream,
  type AiStockAnalysis,
} from "@/lib/ai/client";
import { buildStockAnalysisInput } from "@/lib/ai/stock-analysis";
import { getWorkspace } from "@/lib/data";

export const runtime = "nodejs";

type AnalysisContext = { candleCount: number; asOfDate: string | null; tradeCount: number };
type CacheEntry = { expiresAt: number; analysis: AiStockAnalysis; generatedAt: string };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000;

function encodeSse(event: string, value: unknown) {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
}

function streamCachedResult(cached: CacheEntry, model: string, context: AnalysisContext) {
  return new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encodeSse("meta", { model, context, cached: true }));
      controller.enqueue(encodeSse("done", { analysis: cached.analysis, model, generatedAt: cached.generatedAt, cached: true, context }));
      controller.close();
    },
  }), { headers: streamHeaders() });
}

function streamHeaders() {
  return {
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "content-type": "text/event-stream; charset=utf-8",
    "x-accel-buffering": "no",
  };
}

function streamAnalysis(
  request: Request,
  input: ReturnType<typeof buildStockAnalysisInput>,
  fingerprint: string,
  configuration: NonNullable<ReturnType<typeof getAiConfiguration>>,
) {
  const upstreamController = new AbortController();
  const context = input.dataScope;
  let canceled = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let lastProgressCharacters = 0;
      let lastProgressAt = 0;
      const send = (event: string, value: unknown) => {
        if (closed || canceled) return;
        try {
          controller.enqueue(encodeSse(event, value));
        } catch {
          canceled = true;
          upstreamController.abort();
        }
      };
      const abort = () => upstreamController.abort();
      request.signal.addEventListener("abort", abort, { once: true });
      const heartbeat = setInterval(() => {
        if (closed || canceled) return;
        try {
          controller.enqueue(new TextEncoder().encode(": keep-alive\n\n"));
        } catch {
          canceled = true;
          upstreamController.abort();
        }
      }, 15_000);

      try {
        send("meta", { model: configuration.model, context, cached: false });
        const analysis = await requestAiStockAnalysisStream(input, configuration, {
          onDelta(receivedCharacters) {
            const now = Date.now();
            if (receivedCharacters - lastProgressCharacters < 48 && now - lastProgressAt < 180) return;
            lastProgressCharacters = receivedCharacters;
            lastProgressAt = now;
            send("progress", { receivedCharacters });
          },
          onSection(section) {
            send("section", section);
          },
        }, fetch, upstreamController.signal);
        const generatedAt = new Date().toISOString();
        cache.set(fingerprint, { analysis, generatedAt, expiresAt: Date.now() + CACHE_TTL_MS });
        send("done", { analysis, model: configuration.model, generatedAt, cached: false, context });
      } catch (cause) {
        if (!upstreamController.signal.aborted) {
          const message = cause instanceof Error ? cause.message : "AI分析失败，请稍后重试。";
          console.error("AI stock analysis stream failed:", message);
          send("error", { message });
        }
      } finally {
        clearInterval(heartbeat);
        request.signal.removeEventListener("abort", abort);
        if (!closed && !canceled) {
          closed = true;
          controller.close();
        }
      }
    },
    cancel() {
      canceled = true;
      upstreamController.abort();
    },
  });

  return new Response(stream, { headers: streamHeaders() });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
  const wantsStream = request.headers.get("accept")?.includes("text/event-stream") ?? false;
  if (cached && cached.expiresAt > Date.now()) {
    if (wantsStream) return streamCachedResult(cached, configuration.model, input.dataScope);
    return NextResponse.json({ analysis: cached.analysis, model: configuration.model, generatedAt: cached.generatedAt, cached: true, context: input.dataScope });
  }
  if (wantsStream) return streamAnalysis(request, input, fingerprint, configuration);

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
