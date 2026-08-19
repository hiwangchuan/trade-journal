import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { listTrades } from "@/lib/data";
import { recalculateTrade, syncTags } from "@/lib/trades/persistence";
import { tradeInputSchema, validateLongOnlyTimeline, type TimelineTrade } from "@/lib/trades/validation";

type ExistingTrade = TimelineTrade & { currency: string };

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ message: "交易编号无效。" }, { status: 400 });
  const parsed = tradeInputSchema.omit({ instrumentId: true }).safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "交易数据无效。", issues: parsed.error.issues }, { status: 400 });
  const value = parsed.data;
  const existing = sqlite.prepare("SELECT t.id,t.instrument_id AS instrumentId,t.account_id AS accountId,t.side,t.trade_at AS tradeAt,t.quantity,i.currency FROM trades t JOIN instruments i ON i.id=t.instrument_id WHERE t.id=?").get(id) as ExistingTrade | undefined;
  if (!existing) return NextResponse.json({ message: "没有找到这笔交易。" }, { status: 404 });

  const timeline = sqlite.prepare("SELECT id,instrument_id AS instrumentId,account_id AS accountId,side,trade_at AS tradeAt,quantity FROM trades WHERE instrument_id=? AND id<>?").all(existing.instrumentId, id) as TimelineTrade[];
  const validation = validateLongOnlyTimeline([...timeline, { id, instrumentId: existing.instrumentId, accountId: value.accountId, side: value.side, tradeAt: value.tradeAt, quantity: value.quantity }]);
  if (!validation.valid) return NextResponse.json({ code: "INSUFFICIENT_POSITION", message: validation.message }, { status: 409 });

  sqlite.transaction(() => {
    sqlite.prepare("INSERT OR IGNORE INTO strategies(name) VALUES (?)").run(value.strategy);
    const strategy = sqlite.prepare("SELECT id FROM strategies WHERE name=?").get(value.strategy) as { id: number };
    sqlite.prepare("UPDATE trades SET account_id=?,side=?,trade_at=?,trade_date=?,price=?,quantity=?,fee=?,estimated_exit_fee=?,currency=?,strategy_id=?,reason=?,plan=?,note=?,planned_stop=?,planned_target=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(
      value.accountId, value.side, value.tradeAt, value.tradeDate, value.price, value.quantity, value.fee, value.side === "BUY" ? value.estimatedExitFee : "0", existing.currency, strategy.id, value.reason, value.plan, value.note, value.plannedStop ?? null, value.plannedTarget ?? null, id,
    );
    syncTags(id, value.tags);
    recalculateTrade(id);
  })();
  return NextResponse.json({ trade: listTrades().find((trade) => trade.id === id) });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ message: "交易编号无效。" }, { status: 400 });
  const existing = sqlite.prepare("SELECT id,instrument_id AS instrumentId,account_id AS accountId FROM trades WHERE id=?").get(id) as { id: number; instrumentId: number; accountId: number } | undefined;
  if (!existing) return NextResponse.json({ deleted: false }, { status: 404 });
  const remaining = sqlite.prepare("SELECT id,instrument_id AS instrumentId,account_id AS accountId,side,trade_at AS tradeAt,quantity FROM trades WHERE instrument_id=? AND account_id=? AND id<>?").all(existing.instrumentId, existing.accountId, id) as TimelineTrade[];
  const validation = validateLongOnlyTimeline(remaining);
  if (!validation.valid) return NextResponse.json({ code: "DEPENDENT_SELL", message: `删除后会导致历史持仓为负：${validation.message}` }, { status: 409 });
  const result = sqlite.prepare("DELETE FROM trades WHERE id=?").run(id);
  return NextResponse.json({ deleted: result.changes > 0 });
}
