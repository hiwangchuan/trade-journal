import { NextResponse } from "next/server";
import { listInstruments, listTrades } from "@/lib/data";
export async function GET() { return new NextResponse(JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), instruments: listInstruments(), trades: listTrades() }, null, 2), { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="trade-journal-${new Date().toISOString().slice(0,10)}.json"` } }); }
