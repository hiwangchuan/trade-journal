import { TermTooltip } from "@/components/ui/term-tooltip";
import type { PositionCostSnapshot } from "@/lib/trades/position-cost";
import type { TradeWithAnalysis } from "@/types";

const signedPct = (value: string | null) => value === null ? "—" : `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(2)}%`;

export function PositionCostCard({ snapshot, trade, currency }: { snapshot: PositionCostSnapshot; trade: TradeWithAnalysis; currency: string }) {
  const explanation = "持仓成本线使用移动加权平均法；周期资金回本价还会计入同一持仓周期内此前部分卖出的实际净收入或亏损。持仓归零后开启新周期。";

  if (trade.side === "SELL") {
    return <div className="mb-5 rounded-lg border border-buy/30 bg-buy/[.06] p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-buy"><TermTooltip term="持仓成本与回本价" description={explanation} /></div>
      <div className="mt-3 flex items-end justify-between gap-3"><span className="text-xs text-muted">本次卖出回本价</span><strong className="text-lg tracking-tight">{snapshot.sellBreakEvenPrice ?? "—"} <small className="text-[10px] font-medium text-muted">{currency}</small></strong></div>
      <div className="mt-2 grid grid-cols-2 gap-2 border-t border-buy/15 pt-2 text-[10px]">
        <span className="text-muted">卖出前持仓均价 <b className="ml-1 text-ink">{snapshot.averageCostBefore ?? "—"}</b></span>
        <span className="text-right text-muted">卖价较回本线 <b className={Number(snapshot.sellPriceVsBreakEvenPct ?? 0) >= 0 ? "ml-1 text-buy" : "ml-1 text-sell"}>{signedPct(snapshot.sellPriceVsBreakEvenPct)}</b></span>
        <span className="text-muted">本次匹配数量 <b className="ml-1 text-ink">{snapshot.matchedSellQuantity ?? "—"} 股</b></span>
        <span className="text-right text-muted">均价法本次盈亏 <b className={Number(snapshot.realizedPnlAtAverageCost ?? 0) >= 0 ? "ml-1 text-buy" : "ml-1 text-sell"}>{snapshot.realizedPnlAtAverageCost ?? "—"} {currency}</b></span>
      </div>
      {snapshot.averageCostAfter ? <div className="mt-2 space-y-1 border-t border-buy/15 pt-2 text-[10px] text-muted"><div>卖出后剩余 <b className="text-ink">{snapshot.quantityAfter} 股</b> · 持仓均价 <b className="text-ink">{snapshot.averageCostAfter}</b></div><div>持仓成本回本价 <b className="text-ink">{snapshot.positionBreakEvenPriceAfter}</b> · 周期资金回本价 <b className="text-ink">{snapshot.campaignBreakEvenPriceAfter}</b></div></div> : <div className="mt-2 border-t border-buy/15 pt-2 text-[10px] text-muted">该笔交易后持仓已全部卖出。周期净盈亏：<b className={Number(snapshot.campaignClosedPnl ?? 0) >= 0 ? "text-buy" : "text-sell"}>{snapshot.campaignClosedPnl ?? "—"} {currency}</b></div>}
      <p className="mt-2 text-[9px] leading-4 text-muted">本次回本价使用卖出前持仓均价，并计入这笔 SELL 的实际手续费。</p>
    </div>;
  }

  return <div className="mb-5 rounded-lg border border-buy/30 bg-buy/[.06] p-3">
    <div className="text-[10px] font-semibold uppercase tracking-wide text-buy"><TermTooltip term="持仓成本与回本价" description={explanation} /></div>
    <div className="mt-3 flex items-end justify-between gap-3"><span className="text-xs text-muted">周期资金回本价</span><strong className="text-lg tracking-tight">{snapshot.campaignBreakEvenPriceAfter ?? "—"} <small className="text-[10px] font-medium text-muted">{currency}</small></strong></div>
    <div className="mt-2 grid grid-cols-2 gap-2 border-t border-buy/15 pt-2 text-[10px]">
      <span className="text-muted">交易后持仓 <b className="ml-1 text-ink">{snapshot.quantityAfter} 股</b></span>
      <span className="text-right text-muted">持仓平均成本 <b className="ml-1 text-ink">{snapshot.averageCostAfter ?? "—"}</b></span>
      <span className="text-muted">持仓成本回本价 <b className="ml-1 text-ink">{snapshot.positionBreakEvenPriceAfter}</b></span>
      <span className="text-right text-muted">预计平仓手续费 <b className="ml-1 text-ink">{snapshot.estimatedExitFeeAfter}</b></span>
      <span className="text-muted">周期净投入 <b className="ml-1 text-ink">{snapshot.campaignNetCashOutflowAfter} {currency}</b></span>
      <span className="text-right text-muted">周期价较持仓均价 <b className="ml-1 text-ink">{signedPct(snapshot.campaignRequiredMovePctAfter)}</b></span>
    </div>
    <p className="mt-2 text-[9px] leading-4 text-muted">第 {snapshot.campaignNumber} 个持仓周期。{snapshot.campaignCapitalRecoveredAfter ? "此前卖出净收入已覆盖本周期净投入，剩余卖出只需覆盖平仓费用。" : "周期资金回本价汇总了本周期全部买卖现金流。"}</p>
  </div>;
}
