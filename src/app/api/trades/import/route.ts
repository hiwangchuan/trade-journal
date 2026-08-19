import { NextResponse } from "next/server";
import { z } from "zod";
import { sqlite } from "@/db";
import { recalculateTrade, syncTags } from "@/lib/trades/persistence";
import { tradeInputSchema, validateLongOnlyTimeline, type TimelineTrade } from "@/lib/trades/validation";

const payloadSchema = z.object({
  instruments: z.array(z.object({ id: z.number(), symbol: z.string() })).default([]),
  trades: z.array(z.record(z.string(), z.unknown())),
});

export async function POST(request: Request) {
  const payload = payloadSchema.safeParse(await request.json());
  if (!payload.success) return NextResponse.json({ message: "不支持的交易导出格式。" }, { status: 400 });

  const exportedSymbols = new Map(payload.data.instruments.map((instrument) => [instrument.id, instrument.symbol.toUpperCase()]));
  const localInstruments = sqlite.prepare("SELECT id,symbol,currency FROM instruments").all() as Array<{ id: number; symbol: string; currency: string }>;
  const localBySymbol = new Map(localInstruments.map((instrument) => [instrument.symbol.toUpperCase(), instrument]));
  const localById = new Map(localInstruments.map((instrument) => [instrument.id, instrument]));
  const candidates: Array<z.infer<typeof tradeInputSchema> & { instrumentId: number; currency: string }> = [];

  for (const [index, raw] of payload.data.trades.entries()) {
    const exportedInstrumentId = Number(raw.instrumentId);
    const symbol = exportedSymbols.get(exportedInstrumentId);
    const instrument = symbol ? localBySymbol.get(symbol) : localById.get(exportedInstrumentId);
    if (!instrument) return NextResponse.json({ message: `第 ${index + 1} 笔交易对应的股票尚未添加。` }, { status: 400 });
    const parsed = tradeInputSchema.required({ instrumentId: true }).safeParse({ ...raw, instrumentId: instrument.id, strategy: raw.strategy ?? "Manual", accountId: raw.accountId ?? 1 });
    if (!parsed.success) return NextResponse.json({ message: `第 ${index + 1} 笔交易无效：${parsed.error.issues[0]?.message ?? "字段错误"}` }, { status: 400 });
    candidates.push({ ...parsed.data, instrumentId: instrument.id, currency: instrument.currency });
  }

  const existing = sqlite.prepare("SELECT id,instrument_id AS instrumentId,account_id AS accountId,side,trade_at AS tradeAt,quantity FROM trades").all() as TimelineTrade[];
  const candidateTimeline: TimelineTrade[] = candidates.map((trade, index) => ({ id: Number.MAX_SAFE_INTEGER - candidates.length + index, instrumentId: trade.instrumentId, accountId: trade.accountId, side: trade.side, tradeAt: trade.tradeAt, quantity: trade.quantity }));
  const validation = validateLongOnlyTimeline([...existing, ...candidateTimeline]);
  if (!validation.valid) return NextResponse.json({ code: "INSUFFICIENT_POSITION", message: validation.message }, { status: 409 });

  const imported = sqlite.transaction(() => {
    let count = 0;
    for (const trade of candidates) {
      sqlite.prepare("INSERT OR IGNORE INTO strategies(name) VALUES (?)").run(trade.strategy);
      const strategy = sqlite.prepare("SELECT id FROM strategies WHERE name=?").get(trade.strategy) as { id: number };
      const result = sqlite.prepare("INSERT INTO trades(instrument_id,account_id,side,trade_at,trade_date,price,quantity,fee,estimated_exit_fee,currency,strategy_id,reason,plan,note,planned_stop,planned_target) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
        trade.instrumentId, trade.accountId, trade.side, trade.tradeAt, trade.tradeDate, trade.price, trade.quantity, trade.fee, trade.side === "BUY" ? trade.estimatedExitFee : "0", trade.currency, strategy.id, trade.reason, trade.plan, trade.note, trade.plannedStop ?? null, trade.plannedTarget ?? null,
      );
      const id = Number(result.lastInsertRowid);
      syncTags(id, trade.tags);
      recalculateTrade(id);
      count += 1;
    }
    return count;
  })();
  return NextResponse.json({ imported });
}
