"use client";

import { useMemo } from "react";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { sideLabels } from "@/lib/display-labels";
import { termGlossary } from "@/lib/term-glossary";
import { calculatePositionCostTimeline } from "@/lib/trades/position-cost";
import { formatPct } from "@/lib/utils";
import type { ExitFeeModel, TradeWithAnalysis } from "@/types";

export function TradeTable({ trades, selectedId, exitFeeModel, onSelect }: { trades: TradeWithAnalysis[]; selectedId: number | null; exitFeeModel: ExitFeeModel; onSelect: (trade: TradeWithAnalysis) => void }) {
  const costByTradeId = useMemo(() => new Map(calculatePositionCostTimeline(trades, exitFeeModel).map((snapshot) => [snapshot.tradeId, snapshot])), [exitFeeModel, trades]);
  return <div className="trade-table-wrap"><div className="flex h-11 items-center justify-between px-4"><h2 className="text-xs font-semibold">历史交易</h2><span className="text-[10px] text-muted">共 {trades.length} 笔</span></div><table className="data-table"><thead><tr><th>日期</th><th>方向</th><th>价格</th><th><TermTooltip term="手续费" description={termGlossary.roundTripFees} /></th><th><TermTooltip term="周期回本/成本线" description={termGlossary.breakEven} /></th><th><TermTooltip term="60 日位置" description={termGlossary.rangePosition} /></th><th><TermTooltip term="枢轴距离" description={termGlossary.pivotDistance} /></th><th><TermTooltip term="距 MA20" description={termGlossary.ma20} /></th><th><TermTooltip term="20 日价格表现" description={termGlossary.return20d} /></th></tr></thead><tbody>{trades.map((trade) => {
    const positionCost = costByTradeId.get(trade.id);
    const breakEvenPrice = trade.side === "SELL" ? positionCost?.sellBreakEvenPrice : positionCost?.campaignBreakEvenPriceAfter;
    return <tr key={trade.id} className={selectedId === trade.id ? "selected" : ""} onClick={() => onSelect(trade)}><td>{trade.tradeDate}</td><td className={trade.side === "BUY" ? "buy font-semibold" : "sell font-semibold"}>{sideLabels[trade.side]} {trade.side === "BUY" ? "↑" : "↓"}</td><td>{Number(trade.price).toFixed(2)}</td><td>{trade.side === "BUY" ? `${trade.fee} + ${trade.estimatedExitFee}` : trade.fee}</td><td className="font-semibold">{breakEvenPrice ?? "—"}</td><td>{trade.snapshot?.range60Percentile == null ? "—" : `${Math.round(trade.snapshot.range60Percentile * 100)}%`}</td><td>{formatPct(trade.side === "BUY" ? trade.snapshot?.distanceToPivotLowPct ?? null : trade.snapshot?.distanceToPivotHighPct ?? null)}</td><td>{formatPct(trade.snapshot?.distanceToMa20Pct ?? null)}</td><td className={(trade.outcome?.return20d ?? 0) >= 0 ? "buy" : "sell"}>{formatPct(trade.outcome?.return20d ?? null)}</td></tr>;
  })}</tbody></table></div>;
}
