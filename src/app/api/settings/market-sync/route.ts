import { NextResponse } from "next/server";
import { z } from "zod";
import { getMarketSyncSettings, saveMarketSyncSettings } from "@/lib/market-data/storage";

const schema = z.object({
  autoSync: z.boolean(),
  staleAfterHours: z.coerce.number().int().min(1).max(168),
  reconcileIntervalDays: z.coerce.number().int().min(7).max(365),
});

export async function GET() {
  return NextResponse.json(getMarketSyncSettings());
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "同步设置无效。" }, { status: 400 });
  return NextResponse.json(saveMarketSyncSettings(parsed.data));
}
