import { z } from "zod";
import type { Candle } from "@/types";
import type { MarketDataProvider } from "./types";
import { MarketDataError, type MarketDataErrorCode, validateCandles } from "./types";

const candlesSchema = z.array(z.object({
  date: z.string(),
  open: z.coerce.number(),
  high: z.coerce.number(),
  low: z.coerce.number(),
  close: z.coerce.number(),
  volume: z.coerce.number().optional().default(0),
}));

const searchSchema = z.array(z.object({
  Code: z.string(),
  Name: z.string(),
  Exchange: z.string().optional().default(""),
  Currency: z.string().optional().default("HKD"),
}));

type ErrorPayload = { code?: number | string; message?: string };

export function classifyEodhdError(status: number, message: string): MarketDataErrorCode {
  const normalized = message.toLowerCase();
  if (status === 401 || normalized.includes("api token") || normalized.includes("api key") || normalized.includes("unauthorized")) return "AUTH";
  if (status === 403 || normalized.includes("plan") || normalized.includes("subscription") || normalized.includes("forbidden")) return "PLAN_RESTRICTED";
  if (status === 404 || normalized.includes("not found") || normalized.includes("unknown ticker")) return "SYMBOL_NOT_FOUND";
  if (status === 429 || normalized.includes("limit") || normalized.includes("too many requests")) return "RATE_LIMIT";
  if (status >= 500) return "NETWORK";
  if (status === 400) return "INVALID_RESPONSE";
  return "UNKNOWN";
}

function providerError(response: Response, payload: ErrorPayload | null) {
  const providerStatus = Number(payload?.code) || response.status;
  const message = payload?.message?.trim() || `行情服务请求失败（HTTP ${providerStatus}）。`;
  return new MarketDataError(classifyEodhdError(providerStatus, message), `EODHD：${message}`);
}

export class EodhdProvider implements MarketDataProvider {
  constructor(private apiKey = process.env.EODHD_API_KEY) {}

  private ensureKey() {
    if (!this.apiKey) throw new MarketDataError("AUTH", "尚未配置 EODHD API Key，请前往设置页面保存密钥。");
  }

  async searchInstruments(query: string) {
    this.ensureKey();
    const response = await fetch(`https://eodhd.com/api/search/${encodeURIComponent(query)}?api_token=${encodeURIComponent(this.apiKey!)}&fmt=json`);
    const json = await response.json().catch(() => null) as unknown;
    if (!response.ok || (!Array.isArray(json) && json)) throw providerError(response, json as ErrorPayload | null);
    const parsed = searchSchema.safeParse(json);
    if (!parsed.success) throw new MarketDataError("INVALID_RESPONSE", "EODHD 返回了无法识别的搜索结果。");
    return parsed.data.slice(0, 10).map((item) => ({ symbol: item.Code, name: item.Name, exchange: item.Exchange, currency: item.Currency }));
  }

  private async fetchSeries(url: string, invalidMessage: string) {
    const response = await fetch(url);
    const json = await response.json().catch(() => null) as unknown;
    if (!response.ok || (!Array.isArray(json) && json)) throw providerError(response, json as ErrorPayload | null);
    const parsed = candlesSchema.safeParse(json);
    if (!parsed.success) throw new MarketDataError("INVALID_RESPONSE", invalidMessage);
    return parsed.data;
  }

  async getCandles({ symbol, adjustment = "raw", start, end }: { symbol: string; interval: "1day"; adjustment?: "raw" | "splits"; start?: string; end?: string }): Promise<Candle[]> {
    this.ensureKey();
    const params = new URLSearchParams({ api_token: this.apiKey!, fmt: "json", period: "d", order: "a" });
    if (start) params.set("from", start);
    if (end) params.set("to", end);
    const rawPromise = this.fetchSeries(`https://eodhd.com/api/eod/${encodeURIComponent(symbol)}?${params}`, "EODHD 返回了无法识别的 K 线数据。");
    const splitParams = new URLSearchParams({ api_token: this.apiKey!, fmt: "json", function: "splitadjusted", agg_period: "d", order: "a" });
    if (start) splitParams.set("from", start);
    if (end) splitParams.set("to", end);
    const splitPromise = adjustment === "splits"
      ? this.fetchSeries(`https://eodhd.com/api/technical/${encodeURIComponent(symbol)}?${splitParams}`, "EODHD 返回了无法识别的拆股复权数据。")
      : null;
    const [raw, splitAdjusted] = await Promise.all([rawPromise, splitPromise]);
    if (!raw.length) throw new MarketDataError("SYMBOL_NOT_FOUND", `EODHD 没有返回 ${symbol} 的日线数据，请检查行情代码。`);
    const rawByDate = new Map(raw.map((item) => [item.date.slice(0, 10), item]));
    const prices = splitAdjusted ?? raw;
    return validateCandles(prices.map((item) => ({
      time: item.date.slice(0, 10),
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
      volume: rawByDate.get(item.date.slice(0, 10))?.volume ?? item.volume,
      source: "eodhd",
      adjustment,
    })));
  }
}
