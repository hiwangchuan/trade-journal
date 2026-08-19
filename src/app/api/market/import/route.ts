import { NextResponse } from "next/server";
import { z } from "zod";
import { parseOhlcvCsv } from "@/lib/market-data/csv";
import { replaceCandlesAndRecalculate } from "@/lib/trades/persistence";
import { sqlite } from "@/db";
import type { PriceAdjustment } from "@/types";
import { MarketDataError } from "@/lib/market-data/types";
const schema = z.object({ instrumentId: z.coerce.number(), csv: z.string().min(1) });
export async function POST(request: Request) { try { const value = schema.parse(await request.json()); const instrument = sqlite.prepare("SELECT price_adjustment AS priceAdjustment FROM instruments WHERE id=?").get(value.instrumentId) as { priceAdjustment: PriceAdjustment } | undefined; if (!instrument) return NextResponse.json({ message: "没有找到对应股票。" }, { status: 404 }); const candles = parseOhlcvCsv(value.csv).map((candle) => ({ ...candle, adjustment: instrument.priceAdjustment })); replaceCandlesAndRecalculate(value.instrumentId,candles,instrument.priceAdjustment); return NextResponse.json({ count: candles.length }); } catch (cause) { const message = cause instanceof MarketDataError || cause instanceof Error ? cause.message : "CSV 导入失败。"; return NextResponse.json({ message }, { status: 400 }); } }
