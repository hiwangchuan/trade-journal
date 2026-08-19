import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { listMarketSeries, listMarketSyncRuns } from "@/lib/market-data/storage";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const instrumentId = Number((await params).id);
  if (!Number.isInteger(instrumentId) || instrumentId <= 0) return NextResponse.json({ message: "股票ID无效。" }, { status: 400 });
  const instrument = sqlite.prepare("SELECT id FROM instruments WHERE id=?").get(instrumentId);
  if (!instrument) return NextResponse.json({ message: "未找到该股票。" }, { status: 404 });
  return NextResponse.json({ series: listMarketSeries(instrumentId), syncRuns: listMarketSyncRuns(instrumentId) });
}
