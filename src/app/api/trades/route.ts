import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { listTrades } from "@/lib/data";
import { recalculateTrade, syncTags } from "@/lib/trades/persistence";
import { tradeInputSchema, validateLongOnlyTimeline, type TimelineTrade } from "@/lib/trades/validation";

type InstrumentRow = { currency: string };

export async function POST(request: Request) {
  const parsed = tradeInputSchema.required({ instrumentId: true }).safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "请检查交易字段。", issues: parsed.error.issues }, { status: 400 });
  }
  const value = parsed.data;
  const instrument = sqlite.prepare("SELECT currency FROM instruments WHERE id=?").get(value.instrumentId) as InstrumentRow | undefined;
  if (!instrument) return NextResponse.json({ message: "没有找到对应股票。" }, { status: 404 });

  const timeline = sqlite.prepare("SELECT id,instrument_id AS instrumentId,account_id AS accountId,side,trade_at AS tradeAt,quantity FROM trades WHERE instrument_id=? AND account_id=?").all(value.instrumentId, value.accountId) as TimelineTrade[];
  const validation = validateLongOnlyTimeline([...timeline, { id: Number.MAX_SAFE_INTEGER, instrumentId: value.instrumentId, accountId: value.accountId, side: value.side, tradeAt: value.tradeAt, quantity: value.quantity }]);
  if (!validation.valid) return NextResponse.json({ code: "INSUFFICIENT_POSITION", message: validation.message }, { status: 409 });

  const id = sqlite.transaction(() => {
    sqlite.prepare("INSERT OR IGNORE INTO strategies(name) VALUES (?)").run(value.strategy);
    const strategy = sqlite.prepare("SELECT id FROM strategies WHERE name=?").get(value.strategy) as { id: number };
    const result = sqlite.prepare("INSERT INTO trades(instrument_id,account_id,side,trade_at,trade_date,price,quantity,fee,estimated_exit_fee,currency,strategy_id,reason,plan,note,planned_stop,planned_target) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
      value.instrumentId, value.accountId, value.side, value.tradeAt, value.tradeDate, value.price, value.quantity, value.fee,
      value.side === "BUY" ? value.estimatedExitFee : "0", instrument.currency, strategy.id, value.reason, value.plan, value.note, value.plannedStop ?? null, value.plannedTarget ?? null,
    );
    const tradeId = Number(result.lastInsertRowid);
    syncTags(tradeId, value.tags);
    recalculateTrade(tradeId);
    return tradeId;
  })();

  return NextResponse.json({ trade: listTrades().find((trade) => trade.id === id) }, { status: 201 });
}
