import { NextResponse } from "next/server";
import { z } from "zod";
import { syncAllConfiguredInstruments } from "@/lib/market-data/sync";

export async function POST(request: Request) {
  const parsed = z.object({ mode: z.enum(["incremental", "reconcile"]).default("incremental") }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ message: "同步模式无效。" }, { status: 400 });
  const results = await syncAllConfiguredInstruments(parsed.data.mode);
  return NextResponse.json({ results, succeeded: results.filter((item) => item.success).length, failed: results.filter((item) => !item.success).length });
}
