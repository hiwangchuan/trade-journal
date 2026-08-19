import { NextResponse } from "next/server";
import { z } from "zod";
import { sqlite } from "@/db";
import { listInstruments } from "@/lib/data";

const nonNegativeDecimal = z.string().trim().regex(/^\d+(\.\d+)?$/, "请输入有效的非负数。");

const updateInstrumentSchema = z.object({
  name: z.string().trim().min(1, "请输入股票名称。").max(100, "股票名称不能超过 100 个字符。"),
  market: z.string().trim().min(1, "请输入市场。").max(30, "市场不能超过 30 个字符。"),
  exchange: z.string().trim().min(1, "请输入交易所。").max(30, "交易所不能超过 30 个字符。"),
  currency: z.string().trim().min(3, "请输入有效的货币代码。").max(6, "货币代码不能超过 6 个字符。"),
  timezone: z.string().trim().min(1, "请选择时区。").max(50, "时区不能超过 50 个字符。"),
  dataProvider: z.enum(["csv", "mock", "twelve-data", "eodhd"], { message: "请选择有效的行情来源。" }),
  providerSymbol: z.string().trim().min(1, "请输入行情代码。").max(50, "行情代码不能超过 50 个字符。"),
  priceAdjustment: z.enum(["raw", "splits"]),
  exitFeeRatePct: nonNegativeDecimal.refine((value) => Number(value) < 100, "卖出费率必须小于 100%。"),
  exitFeeFixed: nonNegativeDecimal,
  exitFeeMinimum: nonNegativeDecimal,
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ message: "股票编号无效。" }, { status: 400 });
  }

  const parsed = updateInstrumentSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "请检查股票配置。" },
      { status: 400 },
    );
  }

  const existing = sqlite.prepare("SELECT id,currency,data_provider AS dataProvider,provider_symbol AS providerSymbol,price_adjustment AS priceAdjustment FROM instruments WHERE id=?").get(id) as { id: number; currency: string; dataProvider: string; providerSymbol: string; priceAdjustment: string } | undefined;
  if (!existing) {
    return NextResponse.json({ message: "没有找到这只股票。" }, { status: 404 });
  }

  const value = parsed.data;
  const marketDataChanged = existing.dataProvider !== value.dataProvider || existing.providerSymbol !== value.providerSymbol.toUpperCase() || existing.priceAdjustment !== value.priceAdjustment;
  sqlite.transaction(() => {
    sqlite.prepare(`
      UPDATE instruments
      SET name=?, market=?, exchange=?, currency=?, timezone=?, data_provider=?, provider_symbol=?, price_adjustment=?, exit_fee_rate_pct=?, exit_fee_fixed=?, exit_fee_minimum=?, market_data_stale=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      value.name, value.market.toUpperCase(), value.exchange.toUpperCase(), value.currency.toUpperCase(), value.timezone, value.dataProvider, value.providerSymbol.toUpperCase(), value.priceAdjustment, value.exitFeeRatePct, value.exitFeeFixed, value.exitFeeMinimum, marketDataChanged ? 1 : 0, id,
    );
    if (existing.currency !== value.currency.toUpperCase()) sqlite.prepare("UPDATE trades SET currency=?,updated_at=CURRENT_TIMESTAMP WHERE instrument_id=?").run(value.currency.toUpperCase(), id);
  })();

  const instrument = listInstruments().find((item) => item.id === id);
  return NextResponse.json({ instrument });
}
