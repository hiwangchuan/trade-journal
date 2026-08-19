import { NextResponse } from "next/server";
import { z } from "zod";
import { sqlite } from "@/db";
import { listInstruments } from "@/lib/data";
import { generateMockCandles } from "@/lib/market-data/mock";
import { upsertCandles } from "@/lib/trades/persistence";

const nonNegativeDecimal = z.string().trim().regex(/^\d+(\.\d+)?$/).default("0");

const instrumentSchema = z.object({
  symbol: z.string().trim().min(1).max(24).regex(/^[A-Za-z0-9._-]+$/, "Use letters, numbers, dots, hyphens, or underscores."),
  name: z.string().trim().min(1).max(100),
  market: z.string().trim().min(1).max(30),
  exchange: z.string().trim().min(1).max(30),
  currency: z.string().trim().length(3),
  timezone: z.string().trim().min(1).max(50),
  dataProvider: z.enum(["csv", "mock", "twelve-data", "eodhd"]),
  providerSymbol: z.string().trim().max(50).optional(),
  priceAdjustment: z.enum(["raw", "splits"]).default("splits"),
  exitFeeRatePct: nonNegativeDecimal.refine((value) => Number(value) < 100),
  exitFeeFixed: nonNegativeDecimal,
  exitFeeMinimum: nonNegativeDecimal,
});

export async function GET() {
  return NextResponse.json({ instruments: listInstruments() });
}

export async function POST(request: Request) {
  const parsed = instrumentSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Check the instrument fields." }, { status: 400 });
  const value = parsed.data;
  const symbol = value.symbol.toUpperCase();
  const duplicate = sqlite.prepare("SELECT id FROM instruments WHERE UPPER(symbol)=?").get(symbol);
  if (duplicate) return NextResponse.json({ message: `${symbol} already exists in your workspace.` }, { status: 409 });
  const result = sqlite.prepare("INSERT INTO instruments(symbol,name,exchange,market,currency,timezone,data_provider,provider_symbol,price_adjustment,exit_fee_rate_pct,exit_fee_fixed,exit_fee_minimum) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(symbol,value.name,value.exchange.toUpperCase(),value.market.toUpperCase(),value.currency.toUpperCase(),value.timezone,value.dataProvider,(value.providerSymbol || symbol).toUpperCase(),value.priceAdjustment,value.exitFeeRatePct,value.exitFeeFixed,value.exitFeeMinimum);
  const id = Number(result.lastInsertRowid);
  if (value.dataProvider === "mock") upsertCandles(id, generateMockCandles(symbol).map((candle) => ({ ...candle, adjustment: value.priceAdjustment })), value.priceAdjustment);
  const instrument = listInstruments().find((item) => item.id === id);
  return NextResponse.json({ instrument }, { status: 201 });
}
