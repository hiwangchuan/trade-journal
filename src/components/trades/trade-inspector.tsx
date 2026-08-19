"use client";

import { Edit3, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { contextLabels } from "@/lib/analysis/trade-context";
import { sideLabels, strategyLabel } from "@/lib/display-labels";
import { termGlossary } from "@/lib/term-glossary";
import { calculatePositionCostAtTrade } from "@/lib/trades/position-cost";
import { formatPct, formatPrice } from "@/lib/utils";
import type { Instrument, TradeWithAnalysis } from "@/types";
import { PositionCostCard } from "./position-cost-card";

function RangeRow({ label, value }: { label: string; value: number | null }) {
  const pct = value === null ? null : Math.round(value * 100);
  const labelText = pct === null ? "—" : pct > 100 ? `100%上方 +${pct - 100}%` : pct < 0 ? `0%下方 ${pct}%` : `${pct}%`;
  const trackPct = pct === null ? null : Math.min(100, Math.max(0, pct));
  return <div className="py-2"><div className="flex justify-between"><span className="text-xs text-muted"><TermTooltip term={label} description={termGlossary.rangePosition} /></span><span className="text-xs font-semibold">{labelText}</span></div>{trackPct !== null ? <div className="range-track" style={{ "--range": trackPct } as React.CSSProperties} /> : null}</div>;
}

const tabLabels = { context: "背景", outcome: "结果", journal: "日志" } as const;

export function TradeInspector({ trade, trades, instrument, onClose, onEdit, onDelete }: { trade: TradeWithAnalysis | null; trades: TradeWithAnalysis[]; instrument: Instrument; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  const [tab, setTab] = useState<"context" | "outcome" | "journal">("context");
  const positionCost = useMemo(() => trade ? calculatePositionCostAtTrade(trades, trade.id, instrument.exitFeeModel) : null, [instrument.exitFeeModel, trade, trades]);

  if (!trade) return <aside className="inspector inspector-empty"><div className="p-5"><div className="mb-5 text-sm font-semibold">市场背景</div><div className="rounded-lg border border-dashed border-line p-5 text-center"><div className="text-sm font-semibold">请选择一个买入/卖出点</div><p className="mt-2 text-xs leading-5 text-muted">交易时的历史背景和之后的市场结果会严格分开显示。</p></div></div></aside>;

  const snapshot = trade.snapshot;
  const outcome = trade.outcome;
  const labels = snapshot ? contextLabels(snapshot) : [];

  return <aside className="inspector">
    <div className="flex min-h-14 items-center justify-between border-b border-line px-4"><span className="font-semibold">交易检查器</span><Button variant="ghost" className="h-8 w-8 p-0" onClick={onClose} aria-label="关闭"><X size={15} /></Button></div>
    <div className="tab-list">{(["context", "outcome", "journal"] as const).map((item) => <button key={item} onClick={() => setTab(item)} className={`tab-button ${tab === item ? "active" : ""}`}>{tabLabels[item]}</button>)}</div>
    <div className="p-4">
      <div className="mb-5 flex items-end justify-between"><div><div className={trade.side === "BUY" ? "buy text-base font-bold" : "sell text-base font-bold"}>{sideLabels[trade.side]} <span className="ml-1 text-ink">{Number(trade.price).toFixed(2)}</span></div><div className="mt-1 text-[11px] text-muted">{trade.tradeDate} · {trade.quantity} 股 · {instrument.currency} · 账户 #{trade.accountId}</div></div><div className="flex"><Button variant="ghost" className="h-8 w-8 p-0" onClick={onEdit} aria-label="编辑交易"><Edit3 size={14} /></Button><Button variant="ghost" className="h-8 w-8 p-0 text-sell" onClick={onDelete} aria-label="删除交易"><Trash2 size={14} /></Button></div></div>

      {tab === "context" ? <div>
        {positionCost ? <PositionCostCard snapshot={positionCost} trade={trade} currency={instrument.currency} /> : null}
        <div className="mb-2 text-xs font-semibold">历史背景</div>
        {snapshot ? <>
          <RangeRow label="20 日区间位置" value={snapshot.range20Percentile} />
          <RangeRow label="60 日区间位置" value={snapshot.range60Percentile} />
          <RangeRow label="120 日区间位置" value={snapshot.range120Percentile} />
          <RangeRow label="250 日区间位置" value={snapshot.range250Percentile} />
          <div className="mt-2 border-t border-line"><div className="metric-row"><span className="text-xs text-muted"><TermTooltip term="有效阻力位" description={termGlossary.resistance} /></span><span className="text-right text-xs"><b>{formatPrice(snapshot.nearestPriorPivotHigh)}</b><small className="ml-2 buy">{formatPct(snapshot.distanceToPivotHighPct)}</small></span></div><div className="metric-row"><span className="text-xs text-muted"><TermTooltip term="有效支撑位" description={termGlossary.support} /></span><span className="text-right text-xs"><b>{formatPrice(snapshot.nearestPriorPivotLow)}</b><small className="ml-2 sell">{formatPct(snapshot.distanceToPivotLowPct)}</small></span></div><div className="metric-row"><span className="text-xs text-muted"><TermTooltip term="MA20" description={termGlossary.ma20} /></span><span className="text-right text-xs"><b>{formatPrice(snapshot.ma20)}</b><small className="ml-2 buy">{formatPct(snapshot.distanceToMa20Pct)}</small></span></div><div className="metric-row"><span className="text-xs text-muted"><TermTooltip term="MA60" description={termGlossary.ma60} /></span><span className="text-right text-xs"><b>{formatPrice(snapshot.ma60)}</b><small className="ml-2 buy">{formatPct(snapshot.distanceToMa60Pct)}</small></span></div><div className="metric-row"><span className="text-xs text-muted"><TermTooltip term="成交量比" description={termGlossary.volumeRatio} /></span><b className="text-xs">{snapshot.volumeRatio20?.toFixed(2) ?? "—"}x</b></div><div className="metric-row"><span className="text-xs text-muted"><TermTooltip term="ATR14" description={termGlossary.atr14} /></span><b className="text-xs">{formatPrice(snapshot.atr14)} / {formatPct(snapshot.atrPercent)}</b></div></div>
          <div className="mt-4 flex flex-wrap gap-1.5">{labels.map((label) => <Badge key={label} tone={label.includes("高位") || label.includes("偏离") ? "warning" : "neutral"}>{label}</Badge>)}</div>
          <p className="mt-4 text-[10px] leading-4 text-muted">数据截止到交易日前一个已完成交易日，不包含任何未来 K 线。</p>
        </> : <p className="text-xs text-muted">当前无法计算交易背景。</p>}
      </div> : null}

      {tab === "outcome" ? <div><div className="mb-3 rounded-lg border border-line bg-canvas/40 p-3"><div className="text-[10px] font-semibold uppercase tracking-wide text-muted">原始计划</div><div className="mt-2 flex gap-5 text-xs"><span>止损 <b>{trade.plannedStop ?? "—"}</b></span><span>目标 <b>{trade.plannedTarget ?? "—"}</b></span></div><p className="mt-2 text-xs leading-5 text-muted">{trade.reason || "未记录原始交易理由。"}</p></div><div className="mb-2 text-xs font-semibold">结果验证</div>{outcome ? <div><div className="metric-row"><span className="text-xs text-muted">1 日 / 5 日收益</span><span className="text-xs"><b>{formatPct(outcome.return1d)}</b> / <b>{formatPct(outcome.return5d)}</b></span></div><div className="metric-row"><span className="text-xs text-muted"><TermTooltip term="20 日 / 60 日收益" description={termGlossary.return20d} /></span><span className="text-xs"><b>{formatPct(outcome.return20d)}</b> / <b>{formatPct(outcome.return60d)}</b></span></div><div className="metric-row"><span className="text-xs text-muted"><TermTooltip term="20 日最大有利波动" description={termGlossary.mfe20} /></span><b className="buy text-xs">{formatPct(outcome.mfe20d)}</b></div><div className="metric-row"><span className="text-xs text-muted"><TermTooltip term="20 日最大不利波动" description={termGlossary.mae20} /></span><b className="sell text-xs">{formatPct(outcome.mae20d)}</b></div>{trade.side === "SELL" ? <div className="metric-row"><span className="text-xs text-muted"><TermTooltip term="卖出后 20 日错过涨幅" description={termGlossary.missedUpside} /></span><b className="text-xs text-yellow-500">{formatPct(outcome.sellMissedGain20d)}</b></div> : null}<div className="metric-row"><span className="text-xs text-muted">20 日最高 / 最低</span><b className="text-xs">{formatPrice(outcome.maxHigh20d)} / {formatPrice(outcome.minLow20d)}</b></div></div> : <p className="text-xs text-muted">后续行情数据暂时不足。</p>}<p className="mt-4 text-[10px] leading-4 text-muted">结果只描述之后的市场变化，不将交易简单评价为对或错。</p></div> : null}

      {tab === "journal" ? <div className="space-y-5">{[[trade.side === "BUY" ? "买入手续费" : "卖出手续费", `${trade.fee} ${instrument.currency}`], ...(trade.side === "BUY" ? [["预计卖出手续费", `${trade.estimatedExitFee} ${instrument.currency}`]] : []), ["策略", strategyLabel(trade.strategy)], ["标签", trade.tags?.join(", ") || "—"], ["交易理由", trade.reason || "—"], ["计划", trade.plan || "—"], ["备注", trade.note || "—"]].map(([label, value]) => <div key={label}><div className="label">{label}</div><p className="whitespace-pre-wrap text-xs leading-5">{value}</p></div>)}</div> : null}
    </div>
  </aside>;
}
