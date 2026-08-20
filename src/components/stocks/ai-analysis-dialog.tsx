"use client";

import { BrainCircuit, Clock3, RefreshCw, ShieldCheck, Sparkles, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AiStockAnalysis, AiStockAnalysisSection } from "@/lib/ai/client";
import { consumeServerSentEvents } from "@/lib/ai/sse";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type AnalysisContext = { candleCount: number; asOfDate: string | null; tradeCount: number };
type Result = { analysis: AiStockAnalysis; model: string; generatedAt: string; cached: boolean; context: AnalysisContext };
type StreamMeta = { model: string; cached: boolean; context: AnalysisContext };
const confidenceLabels = { high: "高", medium: "中", low: "低" } as const;

function emptyAnalysis(): AiStockAnalysis {
  return { summary: "", marketObservations: [], positionReview: [], behaviorPatterns: [], watchItems: [], limitations: [] };
}

function addSection(current: AiStockAnalysis, section: AiStockAnalysisSection): AiStockAnalysis {
  if (section.type === "summary") return { ...current, summary: section.value };
  if (section.type === "marketObservation") return { ...current, marketObservations: [...current.marketObservations, section.value] };
  if (section.type === "positionReview") return { ...current, positionReview: [...current.positionReview, section.value] };
  if (section.type === "behaviorPattern") return { ...current, behaviorPatterns: [...current.behaviorPatterns, section.value] };
  if (section.type === "watchItem") return { ...current, watchItems: [...current.watchItems, section.value] };
  return { ...current, limitations: [...current.limitations, section.value] };
}

function Observations({ title, items }: { title: string; items: AiStockAnalysis["marketObservations"] }) {
  return <section><h3 className="mb-3 text-sm font-semibold">{title}</h3><div className="grid gap-3">{items.map((item, index) => <article key={`${item.title}-${index}`} className="rounded-lg border border-line bg-canvas/35 p-4"><div className="flex items-center justify-between gap-3"><h4 className="text-xs font-semibold">{item.title}</h4><Badge tone={item.confidence === "high" ? "buy" : item.confidence === "low" ? "warning" : "neutral"}>置信度 {confidenceLabels[item.confidence]}</Badge></div><p className="mt-2 text-xs leading-5">{item.conclusion}</p><ul className="mt-3 grid gap-1 text-[10px] leading-4 text-muted">{item.evidence.map((evidence, evidenceIndex) => <li key={evidenceIndex}>• {evidence}</li>)}</ul></article>)}</div></section>;
}

export function AiAnalysisDialog({ instrumentId, symbol, name, configured, configuredModel, onClose }: { instrumentId: number; symbol: string; name: string; configured: boolean; configuredModel: string; onClose: () => void }) {
  const [result, setResult] = useState<Result | null>(null);
  const [partial, setPartial] = useState<AiStockAnalysis | null>(null);
  const [meta, setMeta] = useState<StreamMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [progressCharacters, setProgressCharacters] = useState(0);
  const [sectionCount, setSectionCount] = useState(0);
  const [error, setError] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  const stoppedByUserRef = useRef(false);

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function generate() {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    stoppedByUserRef.current = false;
    setResult(null);
    setPartial(emptyAnalysis());
    setMeta(null);
    setProgressCharacters(0);
    setSectionCount(0);
    setLoading(true);
    setError("");
    let completed = false;

    try {
      const response = await fetch(`/api/instruments/${instrumentId}/ai-analysis`, {
        method: "POST",
        headers: { accept: "text/event-stream" },
        signal: controller.signal,
      });
      if (!response.ok) {
        const json = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(json?.message ?? "AI分析失败，请稍后重试。");
      }
      if (!response.body) throw new Error("浏览器未收到流式响应。");

      await consumeServerSentEvents(response.body, ({ event, data }) => {
        const payload = JSON.parse(data) as unknown;
        if (event === "meta") setMeta(payload as StreamMeta);
        if (event === "progress") setProgressCharacters((payload as { receivedCharacters: number }).receivedCharacters);
        if (event === "section") {
          const section = payload as AiStockAnalysisSection;
          setPartial((current) => addSection(current ?? emptyAnalysis(), section));
          setSectionCount((count) => count + 1);
        }
        if (event === "done") {
          setResult(payload as Result);
          setPartial(null);
          completed = true;
        }
        if (event === "error") throw new Error((payload as { message?: string }).message ?? "AI分析失败，请稍后重试。");
      });
      if (!completed) throw new Error("AI 流式响应意外中断，请重试。");
    } catch (cause) {
      controller.abort();
      if (stoppedByUserRef.current) setError("已停止本次分析，可随时重新生成。");
      else if (cause instanceof Error && cause.name !== "AbortError") setError(cause.message);
      else if (!controller.signal.aborted) setError("AI分析失败，请稍后重试。");
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      setLoading(false);
    }
  }

  function stop() {
    stoppedByUserRef.current = true;
    controllerRef.current?.abort();
  }

  function closeDialog() {
    controllerRef.current?.abort();
    onClose();
  }

  const analysis = result?.analysis ?? partial;
  const context = result?.context ?? meta?.context;
  const model = result?.model ?? meta?.model ?? configuredModel;

  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
    <div className="dialog max-w-[900px]" role="dialog" aria-modal="true" aria-label={`${symbol} AI个股复盘`}>
      <div className="flex items-start justify-between border-b border-line px-5 py-4"><div><h2 className="flex items-center gap-2 text-base font-semibold"><BrainCircuit size={18} className="text-buy" /> AI个股复盘 · {symbol}</h2><p className="mt-1 text-xs text-muted">{name} · 确定性指标负责计算，AI以流式方式解释与归纳。</p></div><Button variant="ghost" className="h-8 w-8 p-0" onClick={closeDialog} aria-label="关闭"><X size={16} /></Button></div>
      <div className="grid max-h-[72vh] gap-5 overflow-y-auto p-5">
        {!analysis ? <section className="grid place-items-center rounded-xl border border-dashed border-line px-5 py-10 text-center"><div className="grid h-12 w-12 place-items-center rounded-full bg-buy/10 text-buy"><Sparkles size={22} /></div><h3 className="mt-4 font-semibold">生成当前股票的结构化复盘</h3><p className="mt-2 max-w-xl text-xs leading-5 text-muted">将发送行情指标、交易日期、价格、数量、手续费和策略标签到已配置的AI服务；不会发送交易理由、计划或备注。结论仅用于复盘，不构成投资建议。</p>{configured ? <p className="mt-3 text-[10px] text-muted">当前模型：{configuredModel}</p> : <p className="mt-3 text-xs text-yellow-500">AI服务尚未完成本机配置。</p>}<Button className="mt-5" variant="primary" onClick={generate} disabled={!configured || loading}><Sparkles size={14} /> 生成AI分析</Button></section> : <>
          {loading ? <section className="overflow-hidden rounded-xl border border-buy/25 bg-buy/[.06] p-4" aria-live="polite"><div className="flex items-center justify-between gap-4"><div><div className="flex items-center gap-2 text-xs font-semibold text-buy"><RefreshCw size={14} className="animate-spin" /> AI 正在流式生成复盘</div><p className="mt-2 text-[10px] text-muted">已生成 {sectionCount} 个结构化段落 · 已接收 {progressCharacters.toLocaleString()} 个字符</p></div><Badge tone="buy">实时</Badge></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full w-2/3 animate-pulse rounded-full bg-buy" /></div></section> : null}
          {analysis.summary ? <section className="rounded-xl border border-buy/25 bg-buy/[.06] p-4"><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-buy"><ShieldCheck size={14} /> 综合复盘</div><p className="mt-3 text-sm leading-6">{analysis.summary}</p><div className="mt-3 flex flex-wrap gap-2 text-[10px] text-muted"><span>{model}</span>{context ? <><span>·</span><span>数据截止 {context.asOfDate ?? "—"}</span><span>·</span><span>{context.candleCount.toLocaleString()} 根K线 / {context.tradeCount} 笔交易</span></> : null}{result?.cached ? <Badge>10分钟缓存</Badge> : null}</div></section> : null}
          {analysis.marketObservations.length > 0 ? <Observations title="市场状态" items={analysis.marketObservations} /> : null}
          {analysis.positionReview.length > 0 ? <section><h3 className="mb-3 text-sm font-semibold">持仓与成本</h3><div className="rounded-lg border border-line bg-canvas/35 p-4"><ul className="grid gap-2 text-xs leading-5">{analysis.positionReview.map((item, index) => <li key={index}>• {item}</li>)}</ul></div></section> : null}
          {analysis.behaviorPatterns.length > 0 ? <Observations title="交易行为模式" items={analysis.behaviorPatterns} /> : null}
          {analysis.watchItems.length > 0 || analysis.limitations.length > 0 ? <div className="grid gap-4 md:grid-cols-2">{analysis.watchItems.length > 0 ? <section className="rounded-lg border border-line p-4"><h3 className="text-xs font-semibold">后续观察项</h3><ul className="mt-3 grid gap-2 text-xs leading-5 text-muted">{analysis.watchItems.map((item, index) => <li key={index}>• {item}</li>)}</ul></section> : null}{analysis.limitations.length > 0 ? <section className="rounded-lg border border-line p-4"><h3 className="text-xs font-semibold">样本限制</h3><ul className="mt-3 grid gap-2 text-xs leading-5 text-muted">{analysis.limitations.map((item, index) => <li key={index}>• {item}</li>)}</ul></section> : null}</div> : null}
        </>}
        {error ? <div className="rounded-lg border border-sell/30 bg-sell/10 p-3 text-xs leading-5 text-sell">{error}</div> : null}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-4"><span className="flex items-center gap-1.5 text-[10px] text-muted"><Clock3 size={12} />{loading ? "正在接收，只有完整结果才会写入10分钟缓存。" : "相同数据10分钟内复用完整结果，减少重复调用。"}</span><div className="flex shrink-0 gap-2">{loading ? <Button variant="danger" onClick={stop}><Square size={12} />停止</Button> : analysis ? <Button onClick={generate}><RefreshCw size={13} />重新生成</Button> : null}<Button onClick={closeDialog}>关闭</Button></div></div>
    </div>
  </div>;
}
