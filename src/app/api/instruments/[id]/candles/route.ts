import { NextResponse } from "next/server";
import { sqlite } from "@/db";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) { const rows = sqlite.prepare("SELECT timestamp AS time,open,high,low,close,volume,source FROM candles WHERE instrument_id=? ORDER BY timestamp").all(Number((await params).id)); return NextResponse.json({ candles: rows }); }
