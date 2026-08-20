import { NextResponse } from "next/server";
import { sqlite } from "@/db";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const instrumentId = Number((await params).id);
  const search = new URL(request.url).searchParams;
  const from = search.get("from");
  const to = search.get("to");
  const limit = Math.min(Math.max(Number(search.get("limit") ?? 5000), 1), 5000);
  const rows = sqlite.prepare(`SELECT c.timestamp AS time,c.open,c.high,c.low,c.close,c.volume,c.source,c.adjustment
    FROM candles c JOIN market_data_series s ON s.id=c.series_id
    WHERE s.instrument_id=? AND s.is_active=1
      AND (? IS NULL OR c.timestamp>=?) AND (? IS NULL OR c.timestamp<=?)
    ORDER BY c.timestamp DESC LIMIT ?`).all(instrumentId, from, from, to, to, limit);
  return NextResponse.json({ candles: rows.reverse() });
}
