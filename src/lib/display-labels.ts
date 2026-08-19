import type { TradeSide } from "@/types";

export const sideLabels: Record<TradeSide, string> = {
  BUY: "买入",
  SELL: "卖出",
};

export const strategyOptions = [
  { value: "Breakout", label: "突破" },
  { value: "Pullback", label: "回调" },
  { value: "Support", label: "支撑位" },
  { value: "Mean Reversion", label: "均值回归" },
  { value: "Trend", label: "趋势" },
  { value: "Earnings", label: "财报" },
  { value: "Stop Loss", label: "止损" },
  { value: "Take Profit", label: "止盈" },
  { value: "Manual", label: "手动" },
] as const;

const strategyLabelMap = new Map<string, string>(strategyOptions.map((item) => [item.value, item.label]));

export function strategyLabel(value: string | null | undefined) {
  return strategyLabelMap.get(value ?? "Manual") ?? value ?? "手动";
}
