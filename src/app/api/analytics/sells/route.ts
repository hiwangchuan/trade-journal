import { NextResponse } from "next/server";
import { listTrades } from "@/lib/data";
export async function GET() { const trades = listTrades().filter((trade) => trade.side === "SELL"); const completed = trades.filter((trade) => trade.outcome?.sellMissedGain20d != null); const values = completed.map((trade) => trade.outcome!.sellMissedGain20d!); return NextResponse.json({ eventCount: trades.length, completed20dCount: completed.length, averageMissedUpside20d: values.length ? values.reduce((sum,value) => sum + value,0) / values.length : null, trades }); }
