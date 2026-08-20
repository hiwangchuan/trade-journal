import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { getActiveMarketSeries, getCandlesForActiveSeries } from "@/lib/market-data/storage";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const instrumentId = Number((await params).id);
  const instrument = sqlite.prepare("SELECT symbol FROM instruments WHERE id=?").get(instrumentId) as { symbol: string } | undefined;
  if (!instrument) return NextResponse.json({ message: "未找到该股票。" }, { status: 404 });
  const series = getActiveMarketSeries(instrumentId);
  const candles = getCandlesForActiveSeries(instrumentId);
  const lines = ["date,open,high,low,close,volume,source,adjustment", ...candles.map((item) => [item.time, item.open, item.high, item.low, item.close, item.volume, item.source ?? "", item.adjustment ?? ""].join(","))];
  const filename = `${instrument.symbol.replace(/[^A-Za-z0-9._-]/g, "_")}-${series?.adjustment ?? "prices"}.csv`;
  return new NextResponse(`${lines.join("\n")}\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
