import { NextResponse } from "next/server";
import { recalculateTrade } from "@/lib/trades/persistence";
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) { const ok = recalculateTrade(Number((await params).id)); return NextResponse.json({ recalculated: ok }, { status: ok ? 200 : 404 }); }
