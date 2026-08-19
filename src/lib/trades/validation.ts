import Decimal from "decimal.js";
import { z } from "zod";
import type { TradeSide } from "@/types";

const decimalPattern = /^\d+(\.\d+)?$/;
const positiveDecimal = z.string().trim().regex(decimalPattern, "请输入有效数字。").refine((value) => new Decimal(value).gt(0), "数值必须大于 0。");
const nonNegativeDecimal = z.string().trim().regex(decimalPattern, "请输入有效数字。").refine((value) => new Decimal(value).gte(0), "数值不能小于 0。");
const optionalPositiveDecimal = z.preprocess((value) => value === "" || value === undefined ? null : value, z.union([positiveDecimal, z.null()]));

export const tradeInputSchema = z.object({
  instrumentId: z.coerce.number().int().positive().optional(),
  accountId: z.coerce.number().int().positive().default(1),
  side: z.enum(["BUY", "SELL"]),
  tradeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "交易日期格式无效。"),
  tradeAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/, "交易时间格式无效。"),
  price: positiveDecimal,
  quantity: positiveDecimal,
  fee: nonNegativeDecimal.default("0"),
  estimatedExitFee: nonNegativeDecimal.default("0"),
  currency: z.string().trim().min(3).max(6).optional(),
  strategy: z.string().trim().min(1).max(100).default("Manual"),
  reason: z.string().max(5000).default(""),
  plan: z.string().max(5000).default(""),
  note: z.string().max(5000).default(""),
  plannedStop: optionalPositiveDecimal.optional(),
  plannedTarget: optionalPositiveDecimal.optional(),
  tags: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
});

export type TimelineTrade = {
  id: number;
  instrumentId: number;
  accountId: number;
  side: TradeSide;
  tradeAt: string;
  quantity: string;
};

export function validateLongOnlyTimeline(trades: TimelineTrade[]) {
  const positions = new Map<string, Decimal>();
  const ordered = [...trades].sort((a, b) => a.tradeAt.localeCompare(b.tradeAt) || a.id - b.id);
  for (const trade of ordered) {
    const key = `${trade.instrumentId}:${trade.accountId}`;
    const before = positions.get(key) ?? new Decimal(0);
    const quantity = new Decimal(trade.quantity);
    const after = trade.side === "BUY" ? before.plus(quantity) : before.minus(quantity);
    if (after.lt(0)) {
      return {
        valid: false as const,
        tradeId: trade.id,
        available: before.toString(),
        attempted: quantity.toString(),
        message: `卖出数量 ${quantity.toString()} 超过当时可用持仓 ${before.toString()}。当前版本仅支持做多交易。`,
      };
    }
    positions.set(key, after);
  }
  return { valid: true as const };
}
