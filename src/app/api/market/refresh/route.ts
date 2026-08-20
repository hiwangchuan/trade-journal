import { NextResponse } from "next/server";
import { z } from "zod";
import { MarketDataError } from "@/lib/market-data/types";
import { syncInstrumentMarketData } from "@/lib/market-data/sync";

export async function POST(request: Request) {
  try {
    const { instrumentId, mode } = z.object({
      instrumentId: z.coerce.number().int().positive(),
      mode: z.enum(["incremental", "backfill", "reconcile"]).default("incremental"),
    }).parse(await request.json());
    return NextResponse.json(await syncInstrumentMarketData(instrumentId, mode));
  } catch (cause) {
    const error = cause instanceof MarketDataError ? cause : new MarketDataError("UNKNOWN", cause instanceof Error ? cause.message : "行情刷新失败。");
    const status = error.code === "AUTH" ? 401 : error.code === "PLAN_RESTRICTED" ? 403 : error.code === "SYMBOL_NOT_FOUND" ? 404 : error.code === "RATE_LIMIT" ? 429 : error.code === "NETWORK" ? 502 : 400;
    const message = error.code === "PLAN_RESTRICTED" ? `当前行情套餐不支持该请求。${error.message}` : error.message;
    return NextResponse.json({ code: error.code, message }, { status });
  }
}
