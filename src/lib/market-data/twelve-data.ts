import { z } from "zod";
import type { Candle } from "@/types";
import type { MarketDataProvider } from "./types";
import { MarketDataError, type MarketDataErrorCode, validateCandles } from "./types";

const valuesSchema = z.object({ values: z.array(z.object({ datetime: z.string(), open: z.string(), high: z.string(), low: z.string(), close: z.string(), volume: z.string().optional() })) });
type ErrorPayload = { code?: number | string; message?: string; status?: string };

export function classifyTwelveDataError(status: number, message: string): MarketDataErrorCode {
  const normalized = message.toLowerCase();
  if (status === 401 || normalized.includes("api key") || normalized.includes("apikey") || normalized.includes("unauthorized")) return "AUTH";
  if (status === 403 || normalized.includes("plan") || normalized.includes("subscription") || normalized.includes("permission")) return "PLAN_RESTRICTED";
  if (status === 404 || normalized.includes("symbol") || normalized.includes("not found")) return "SYMBOL_NOT_FOUND";
  if (status === 429 || normalized.includes("rate limit") || normalized.includes("too many requests")) return "RATE_LIMIT";
  if (status >= 500) return "NETWORK";
  if (status === 400) return "INVALID_RESPONSE";
  return "UNKNOWN";
}

function providerError(response: Response, payload: ErrorPayload | null) {
  const providerStatus = Number(payload?.code) || response.status;
  const message = payload?.message?.trim() || `行情服务请求失败（HTTP ${providerStatus}）。`;
  return new MarketDataError(classifyTwelveDataError(providerStatus, message), `Twelve Data：${message}`);
}

export class TwelveDataProvider implements MarketDataProvider {
  constructor(private apiKey = process.env.TWELVE_DATA_API_KEY) {}

  private ensureKey() {
    if (!this.apiKey) throw new MarketDataError("AUTH", "尚未配置 Twelve Data API Key，请前往设置页面保存密钥。");
  }

  async searchInstruments(query: string) {
    this.ensureKey();
    const response = await fetch(`https://api.twelvedata.com/symbol_search?symbol=${encodeURIComponent(query)}&apikey=${this.apiKey}`);
    const json = await response.json().catch(() => null) as ({ data?: Array<{ symbol: string; instrument_name: string; exchange: string; currency?: string }> } & ErrorPayload) | null;
    if (!response.ok || json?.status === "error") throw providerError(response, json);
    return (json?.data ?? []).slice(0, 10).map((item) => ({ symbol: item.symbol, name: item.instrument_name, exchange: item.exchange, currency: item.currency ?? "USD" }));
  }

  async getCandles({ symbol, adjustment = "splits", start, end }: { symbol: string; interval: "1day"; adjustment?: "raw" | "splits"; start?: string; end?: string }): Promise<Candle[]> {
    this.ensureKey();
    const params = new URLSearchParams({ symbol, interval: "1day", adjust: adjustment === "splits" ? "splits" : "none", apikey: this.apiKey! });
    if (!start || !end) params.set("outputsize", "5000");
    if (start) params.set("start_date", start);
    if (end) params.set("end_date", end);
    const response = await fetch(`https://api.twelvedata.com/time_series?${params}`);
    const json = await response.json().catch(() => null) as (ErrorPayload & { values?: unknown }) | null;
    if (!response.ok || json?.status === "error") throw providerError(response, json);
    const parsed = valuesSchema.safeParse(json);
    if (!parsed.success) throw new MarketDataError("INVALID_RESPONSE", "Twelve Data 返回了无法识别的数据格式。");
    return validateCandles(parsed.data.values.map((item) => ({ time: item.datetime.slice(0, 10), open: Number(item.open), high: Number(item.high), low: Number(item.low), close: Number(item.close), volume: Number(item.volume ?? 0), source: "twelve-data", adjustment })));
  }
}
