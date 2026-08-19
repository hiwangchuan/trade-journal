"use client";

import { BrainCircuit, Clock3, RefreshCw, ShieldCheck, Sparkles, X } from "lucide-react";
import { useState } from "react";
import type { AiStockAnalysis } from "@/lib/ai/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Result = { analysis: AiStockAnalysis; model: string; generatedAt: string; cached: boolean; context: { candleCount: number; asOfDate: string | null; tradeCount: number } };
const confidenceLabels = { high: "高", medium: "中", low: "低" } as const;

function Observations({ title, items }: { title: string; items: AiStockAnalysis["marketObservations"] }) {
  return <section><h3 className="mb-3 text-sm font-semibold">{title}</h3><div className="grid gap-3">{items.map((item, index) => <article key={`${item.title}-${index}`} className="rounded-lg border border-line bg-canvas/35 p-4"><div className="flex items-center justify-between gap-3"><h4 className="text-xs font-semibold">{item.title}</h4><Badge tone={item.confidence === "high" ? "buy" : item.confidence === "low" ? "warning" : "neutral"}>置信度 {confidenceLabels[item.confidence]}</Badge></div><p className="mt-2 text-xs leading-5">{item.conclusion}</p><ul className="mt-3 grid gap-1 text-[10px] leading-4 text-muted">{item.evidence.map((evidence, evidenceIndex) => <li key={evidenceIndex}>• {evidence}</li>)}</ul></article>)}</div></section>;
}

export function AiAnalysisDialog({ instrumentId, symbol, name, configured, configuredModel, onClose }: { instrumentId: number; symbol: string; name: string; configured: boolean; configuredModel: string; onClose: () => void }) {
  const [result, setResult] = useState<Result | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  async function generate() {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/instruments/${instrumentId}/ai-analysis`, { method: "POST" }); const json = await response.json();
      if (!response.ok) throw new Error(json.message ?? "AI分析失败，请稍后重试。");
      setResult(json);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "AI分析失败，请稍后重试。"); } finally { setLoading(false); }
  }

  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="dialog max-w-[900px]" role="dialog" aria-modal="true" aria-label={`${symbol} AI个股复盘`}>
      <div className="flex items-start justify-between border-b border-line px-5 py-4"><div><h2 className="flex items-center gap-2 text-base font-semibold"><BrainCircuit size={18} className="text-buy" /> AI个股复盘 · {symbol}</h2><p className="mt-1 text-xs text-muted">{name} · 由确定性指标提供数据，AI只负责解释与归纳。</p></div><Button variant="ghost" className="h-8 w-8 p-0" onClick={onClose} aria-label="关闭"><X size={16} /></Button></div>
      <div className="grid max-h-[72vh] gap-5 overflow-y-auto p-5">
        {!result ? <section className="grid place-items-center rounded-xl border border-dashed border-line px-5 py-10 text-center"><div className="grid h-12 w-12 place-items-center rounded-full bg-buy/10 text-buy"><Sparkles size={22} /></div><h3 className="mt-4 font-semibold">生成当前股票的结构化复盘</h3><p className="mt-2 max-w-xl text-xs leading-5 text-muted">将发送行情指标、交易日期、价格、数量、手续费和策略标签到已配置的AI服务；不会发送交易理由、计划或备注。结论仅用于复盘，不构成投资建议。</p>{configured ? <p className="mt-3 text-[10px] text-muted">当前模型：{configuredModel}</p> : <p className="mt-3 text-xs text-yellow-500">AI服务尚未完成本机配置。</p>}<Button className="mt-5" variant="primary" onClick={generate} disabled={!configured || loading}>{loading ? <><RefreshCw size={14} className="animate-spin" /> 正在分析数据…</> : <><Sparkles size={14} /> 生成AI分析</>}</Button></section> : <>
          <section className="rounded-xl border border-buy/25 bg-buy/[.06] p-4"><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-buy"><ShieldCheck size={14} /> 综合复盘</div><p className="mt-3 text-sm leading-6">{result.analysis.summary}</p><div className="mt-3 flex flex-wrap gap-2 text-[10px] text-muted"><span>{result.model}</span><span>·</span><span>数据截止 {result.context.asOfDate ?? "—"}</span><span>·</span><span>{result.context.candleCount.toLocaleString()} 根K线 / {result.context.tradeCount} 笔交易</span>{result.cached ? <Badge>10分钟缓存</Badge> : null}</div></section>
          <Observations title="市场状态" items={result.analysis.marketObservations} />
          <section><h3 className="mb-3 text-sm font-semibold">持仓与成本</h3><div className="rounded-lg border border-line bg-canvas/35 p-4"><ul className="grid gap-2 text-xs leading-5">{result.analysis.positionReview.map((item, index) => <li key={index}>• {item}</li>)}</ul></div></section>
          <Observations title="交易行为模式" items={result.analysis.behaviorPatterns} />
          <div className="grid gap-4 md:grid-cols-2"><section className="rounded-lg border border-line p-4"><h3 className="text-xs font-semibold">后续观察项</h3><ul className="mt-3 grid gap-2 text-xs leading-5 text-muted">{result.analysis.watchItems.map((item, index) => <li key={index}>• {item}</li>)}</ul></section><section className="rounded-lg border border-line p-4"><h3 className="text-xs font-semibold">样本限制</h3><ul className="mt-3 grid gap-2 text-xs leading-5 text-muted">{result.analysis.limitations.map((item, index) => <li key={index}>• {item}</li>)}</ul></section></div>
        </>}
        {error ? <div className="rounded-lg border border-sell/30 bg-sell/10 p-3 text-xs leading-5 text-sell">{error}</div> : null}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-4"><span className="flex items-center gap-1.5 text-[10px] text-muted"><Clock3 size={12} />相同数据10分钟内复用结果，减少重复调用。</span><div className="flex gap-2">{result ? <Button onClick={generate} disabled={loading}><RefreshCw size={13} className={loading ? "animate-spin" : ""} />重新生成</Button> : null}<Button onClick={onClose}>关闭</Button></div></div>
    </div>
  </div>;
}
