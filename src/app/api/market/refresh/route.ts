import { NextResponse } from "next/server";
import { z } from "zod";
import { sqlite } from "@/db";
import { MockProvider } from "@/lib/market-data/mock";
import { TwelveDataProvider } from "@/lib/market-data/twelve-data";
import { EodhdProvider } from "@/lib/market-data/eodhd";
import { MarketDataError } from "@/lib/market-data/types";
import { replaceCandlesAndRecalculate } from "@/lib/trades/persistence";
import type { PriceAdjustment } from "@/types";

type InstrumentRow = { symbol: string; providerSymbol: string; dataProvider: string; priceAdjustment: PriceAdjustment };

export async function POST(request: Request) {
  try {
    const { instrumentId } = z.object({ instrumentId: z.coerce.number() }).parse(await request.json());
    const row = sqlite.prepare("SELECT symbol,provider_symbol AS providerSymbol,data_provider AS dataProvider,price_adjustment AS priceAdjustment FROM instruments WHERE id=?").get(instrumentId) as InstrumentRow | undefined;
    if (!row) return NextResponse.json({ message: "未找到该股票。" }, { status: 404 });
    if (row.dataProvider === "csv") return NextResponse.json({ code: "CSV_MANAGED", message: "该股票使用 CSV 行情，请导入 OHLCV CSV 文件进行更新。" }, { status: 400 });

    const provider = row.dataProvider === "twelve-data"
      ? new TwelveDataProvider()
      : row.dataProvider === "eodhd"
        ? new EodhdProvider()
        : row.dataProvider === "mock"
          ? new MockProvider()
          : null;
    if (!provider) return NextResponse.json({ code: "INVALID_PROVIDER", message: "该股票的行情来源配置无效，请在股票配置中重新选择。" }, { status: 400 });
    const candles = await provider.getCandles({ symbol: row.providerSymbol || row.symbol, interval: "1day", adjustment: row.priceAdjustment });
    replaceCandlesAndRecalculate(instrumentId, candles, row.priceAdjustment);
    return NextResponse.json({ count: candles.length, adjustment: row.priceAdjustment });
  } catch (cause) {
    const error = cause instanceof MarketDataError ? cause : new MarketDataError("UNKNOWN", cause instanceof Error ? cause.message : "行情刷新失败。");
    const status = error.code === "AUTH" ? 401 : error.code === "PLAN_RESTRICTED" ? 403 : error.code === "SYMBOL_NOT_FOUND" ? 404 : error.code === "RATE_LIMIT" ? 429 : error.code === "NETWORK" ? 502 : 400;
    const message = error.code === "PLAN_RESTRICTED" ? `当前行情套餐不支持该请求。${error.message}` : error.message;
    return NextResponse.json({ code: error.code, message }, { status });
  }
}
