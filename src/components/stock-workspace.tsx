"use client";
import dynamic from "next/dynamic";
import { ChartNoAxesCombined, Database, HardDrive, Layers3, Plus, RefreshCw, RotateCcw, Settings2, Sparkles } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import type { DcaAnalysisData, StockWorkspaceData, TradeWithAnalysis } from "@/types";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { TradeForm } from "./trades/trade-form";
import { TradeInspector } from "./trades/trade-inspector";
import { TradeTable } from "./trades/trade-table";
import { InstrumentSettingsDialog } from "./stocks/instrument-settings-dialog";
import { MarketDataDialog } from "./stocks/market-data-dialog";
import { AiAnalysisDialog } from "./stocks/ai-analysis-dialog";
import { PriceLevelsDialog } from "./stocks/price-levels-dialog";

const StockChart = dynamic(() => import("./chart/stock-chart"), { ssr: false, loading: () => <div className="grid h-full place-items-center text-xs text-muted">Loading chart…</div> });

export function StockWorkspace({ data, twelveDataConfigured, eodhdConfigured, aiConfigured, aiModel }: { data: StockWorkspaceData; twelveDataConfigured: boolean; eodhdConfigured: boolean; aiConfigured: boolean; aiModel: string }) {
  const [trades, setTrades] = useState(data.trades); const [selected, setSelected] = useState<TradeWithAnalysis | null>(data.trades[0] ?? null);
  const [dialog, setDialog] = useState<{ date: string; price: number; trade?: TradeWithAnalysis | null } | null>(null); const [settingsOpen, setSettingsOpen] = useState(false); const [marketDataOpen, setMarketDataOpen] = useState(false); const [aiAnalysisOpen, setAiAnalysisOpen] = useState(false); const [priceLevelsOpen, setPriceLevelsOpen] = useState(false); const [priceLevels, setPriceLevels] = useState(data.manualLevels); const [ma20, setMa20] = useState(true); const [ma60, setMa60] = useState(true); const [showTrades, setShowTrades] = useState(true); const [dcaEnabled, setDcaEnabled] = useState(false); const [dcaLoading, setDcaLoading] = useState(false); const [dcaData, setDcaData] = useState<DcaAnalysisData | null>(null); const [selectedDcaId, setSelectedDcaId] = useState(""); const [refreshing, setRefreshing] = useState(false); const [message, setMessage] = useState(""); const csvRef = useRef<HTMLInputElement>(null);
  const candles = data.candles; const current = candles.at(-1); const previous = candles.at(-2); const change = current && previous ? ((current.close / previous.close) - 1) * 100 : 0;
  const activeProvider = data.marketData?.provider ?? data.instrument.dataProvider;
  const sourceName = activeProvider === "mock" ? "演示数据" : activeProvider === "twelve-data" ? "Twelve Data" : activeProvider === "eodhd" ? "EODHD" : candles.length ? "CSV 数据" : "暂无行情";
  const sourceLabel = `${sourceName} · ${(data.marketData?.adjustment ?? data.instrument.priceAdjustment) === "splits" ? "拆股复权" : "原始价格"}`;
  const activePriceLevelCount = priceLevels.filter((level) => level.active).length;
  const priceLevelSegments = useMemo(() => priceLevels.flatMap((level) => level.segments), [priceLevels]);
  const select = useCallback((trade: TradeWithAnalysis) => setSelected(trade), []);
  const recordAt = useCallback((date: string, price: number) => setDialog({ date, price }), []);
  const loadDca = useCallback(async (force = false) => {
    setDcaLoading(true); setMessage("");
    try {
      const response = await fetch(`/api/instruments/${data.instrument.id}/dca-analysis`, { method: force ? "POST" : "GET" });
      const json = await response.json() as DcaAnalysisData & { message?: string };
      if (!response.ok) throw new Error(json.message ?? "定投曲线计算失败。");
      setDcaData(json);
      setSelectedDcaId((currentId) => json.cohorts.some((cohort) => cohort.id === currentId) ? currentId : json.cohorts[0]?.id ?? "");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "定投曲线计算失败。"); }
    finally { setDcaLoading(false); }
  }, [data.instrument.id]);
  const save = (trade: TradeWithAnalysis) => { setTrades((items) => { const exists = items.some((item) => item.id === trade.id); return (exists ? items.map((item) => item.id === trade.id ? trade : item) : [trade, ...items]).sort((a,b) => b.tradeAt.localeCompare(a.tradeAt)); }); setSelected(trade); if (dcaEnabled) void loadDca(); };
  async function remove() { if (!selected || !confirm("确定删除这笔交易及其分析结果吗？")) return; const response = await fetch(`/api/trades/${selected.id}`, { method: "DELETE" }); const json = await response.json(); if (response.ok) { setTrades((items) => items.filter((item) => item.id !== selected.id)); setSelected(null); if (dcaEnabled) void loadDca(); } else setMessage(json.message ?? "无法删除交易。"); }
  async function refresh() { setRefreshing(true); setMessage(""); const response = await fetch("/api/market/refresh", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ instrumentId: data.instrument.id, mode: "incremental" }) }); const json = await response.json(); if (response.ok) { setMessage(`新增 ${json.inserted} 根，修正 ${json.updated} 根，本地累计 ${json.total} 根。`); location.reload(); } else setMessage(json.message ?? "行情刷新失败。"); setRefreshing(false); }
  async function importCsv(file?: File) { if (!file) return; const csv = await file.text(); const response = await fetch("/api/market/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ instrumentId: data.instrument.id, csv }) }); const json = await response.json(); if (response.ok) { setMessage(`新增 ${json.inserted} 根，修正 ${json.updated} 根，本地累计 ${json.total} 根。`); location.reload(); } else setMessage(json.message ?? "导入失败。"); }
  const emptyMessage = data.instrument.dataProvider === "twelve-data" && !twelveDataConfigured
    ? "尚未配置 Twelve Data API Key。请前往“设置 → 行情 K 线”保存密钥，然后返回本页刷新。"
    : data.instrument.dataProvider === "eodhd" && !eodhdConfigured
      ? "尚未配置 EODHD API Key。请前往“设置 → 行情 K 线”保存港股数据密钥，然后返回本页刷新。"
    : data.instrument.dataProvider === "csv"
      ? "该股票使用 CSV 行情，请导入包含 date、open、high、low、close、volume 的文件。"
      : "点击刷新获取行情，或导入 OHLCV CSV 文件。";
  const selectedDca = dcaData?.cohorts.find((cohort) => cohort.id === selectedDcaId) ?? dcaData?.cohorts[0] ?? null;
  async function toggleDca() {
    if (dcaEnabled) { setDcaEnabled(false); return; }
    setDcaEnabled(true);
    if (!dcaData) await loadDca();
  }
  return <div className="stock-shell">
    <header className="stock-header"><div><div className="flex items-baseline gap-2"><h1 className="text-lg font-bold tracking-tight">{data.instrument.name}</h1><span className="text-sm text-muted">{data.instrument.symbol}</span></div><div className="mt-2 flex flex-wrap items-baseline gap-3"><span className="text-3xl font-bold tracking-[-.04em]">{current?.close.toFixed(2) ?? "—"}</span><span className="text-xs text-muted">{data.instrument.currency}</span>{current && previous ? <span className={change >= 0 ? "buy text-lg font-bold" : "sell text-lg font-bold"}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</span> : null}<Badge>{sourceLabel}</Badge>{data.marketData ? <Badge tone={data.marketData.status === "HEALTHY" ? "buy" : "warning"}>本地累计 {data.marketData.candleCount.toLocaleString()} 根</Badge> : null}{data.instrument.marketDataStale ? <Badge tone="warning">配置已变更 · 旧系列保留</Badge> : null}<span className="text-[10px] text-muted">数据范围 {data.marketData?.earliestDate ?? "—"} ～ {data.marketData?.latestDate ?? "—"} · 上次成功 {data.marketData?.lastSuccessAt?.slice(0, 16) ?? "从未"}</span></div></div><div className="flex flex-wrap justify-end gap-2"><Button onClick={() => setMarketDataOpen(true)}><HardDrive size={14} /> 行情数据</Button><Button onClick={() => setSettingsOpen(true)}><Settings2 size={14} /> 股票配置</Button><Button onClick={refresh} disabled={refreshing || data.instrument.dataProvider === "csv"}><RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />{refreshing ? "正在刷新" : "增量同步"}</Button><Button variant="primary" onClick={() => setDialog({ date: current?.time ?? new Date().toISOString().slice(0,10), price: current?.close ?? 0 })}><Plus size={14} /> 记录交易</Button>{message ? <span className="basis-full text-right text-[10px] text-muted">{message}</span> : null}</div></header>
    <div className="stock-toolbar"><Button className="shrink-0">日线</Button><Button title="显示或隐藏 20 日简单移动平均线" className={ma20 ? "border-blue-500/50 text-blue-400" : ""} onClick={() => setMa20((value) => !value)}><span className="h-px w-4 bg-blue-400" /> MA20</Button><Button title="显示或隐藏 60 日简单移动平均线" className={ma60 ? "border-yellow-500/50 text-yellow-400" : ""} onClick={() => setMa60((value) => !value)}><span className="h-px w-4 bg-yellow-400" /> MA60</Button><Button title="管理可验证、带历史版本的支撑位、阻力位和观察位" className={activePriceLevelCount ? "border-buy/40" : ""} onClick={() => setPriceLevelsOpen(true)}><Layers3 size={13} /> 价格位{activePriceLevelCount ? ` ${activePriceLevelCount}` : ""}</Button><Button className={showTrades ? "border-buy/50" : ""} onClick={() => setShowTrades((value) => !value)}>买/卖 ↕</Button><Button title="在K线中叠加历史情景与真实含费收益，不连接券商或下单" className={dcaEnabled ? "border-buy/50 text-buy" : ""} onClick={toggleDca} disabled={dcaLoading}><ChartNoAxesCombined size={13} /> {dcaLoading ? "计算中…" : "定投曲线"}</Button><Button title="使用结构化行情与交易数据生成AI复盘" onClick={() => setAiAnalysisOpen(true)}><Sparkles size={13} /> AI分析</Button><Button onClick={() => location.reload()}><RotateCcw size={13} /> 重置视图</Button>{data.instrument.dataProvider === "csv" ? <Button onClick={() => csvRef.current?.click()}><Database size={13} /> 导入 CSV</Button> : null}<input ref={csvRef} hidden type="file" accept=".csv,text/csv" onChange={(event) => importCsv(event.target.files?.[0])} /></div>
    {dcaEnabled ? <div className="dca-summary-bar">
      <div className="dca-summary-selector"><span className="whitespace-nowrap text-xs font-semibold">定投收益对比</span>{dcaData?.cohorts.length ? <select aria-label="选择定投月份" className="field h-8 py-0 text-xs" value={selectedDca?.id ?? ""} onChange={(event) => setSelectedDcaId(event.target.value)}>{dcaData.cohorts.map((cohort) => <option key={cohort.id} value={cohort.id}>{cohort.month} · 账户#{cohort.accountId}</option>)}</select> : null}</div>
      {dcaLoading ? <span className="text-xs text-muted">正在计算历史情景…</span> : selectedDca ? <><Badge tone={selectedDca.confidence === "high" || selectedDca.confidence === "medium" ? "buy" : "warning"}>历史样本 {selectedDca.sampleCount}</Badge><div className="dca-summary-metric"><span>含费投入</span><strong>{selectedDca.investedAmount}</strong></div><div className="dca-summary-metric"><span>当前净收益</span><strong className={(selectedDca.currentReturnPct ?? 0) >= 0 ? "buy" : "sell"}>{selectedDca.currentReturnPct === null ? "—" : `${selectedDca.currentReturnPct >= 0 ? "+" : ""}${selectedDca.currentReturnPct.toFixed(2)}%`}</strong></div><Button title="保留旧快照并生成新的预测版本" onClick={() => loadDca(true)} disabled={dcaLoading}><RefreshCw size={12} /> 重建预测</Button></> : <span className="text-xs text-muted">当前没有可分析的买入批次。</span>}
    </div> : null}
    <section className="chart-region">{candles.length ? <StockChart candles={candles} trades={trades} selectedId={selected?.id ?? null} showMa20={ma20} showMa60={ma60} showTrades={showTrades} dcaCohort={dcaEnabled ? selectedDca : null} levels={priceLevelSegments} onSelect={select} onRecordAt={recordAt} /> : <div className="grid h-full place-items-center"><div className="max-w-sm text-center"><Database className="mx-auto mb-3 text-muted" /><h2 className="font-semibold">暂无 K 线数据</h2><p className="mt-2 text-xs leading-5 text-muted">{emptyMessage}</p><div className="mt-4 flex justify-center gap-2">{data.instrument.dataProvider === "csv" ? <Button onClick={() => csvRef.current?.click()}>导入 CSV</Button> : <Button onClick={refresh} disabled={refreshing}>{refreshing ? "正在同步" : "完整回填"}</Button>}</div></div></div>}</section>
    <TradeInspector trade={selected} trades={trades} instrument={data.instrument} onClose={() => setSelected(null)} onEdit={() => selected && setDialog({ date: selected.tradeDate, price: Number(selected.price), trade: selected })} onDelete={remove} />
    <TradeTable trades={trades} selectedId={selected?.id ?? null} exitFeeModel={data.instrument.exitFeeModel} onSelect={select} />
    {dialog ? <TradeForm instrument={data.instrument} defaultDate={dialog.date} defaultPrice={dialog.price} trade={dialog.trade} onClose={() => setDialog(null)} onSaved={save} /> : null}
    {settingsOpen ? <InstrumentSettingsDialog instrument={data.instrument} onClose={() => setSettingsOpen(false)} onSaved={() => location.reload()} /> : null}
    {marketDataOpen ? <MarketDataDialog instrumentId={data.instrument.id} summary={data.marketData} onClose={() => setMarketDataOpen(false)} /> : null}
    {priceLevelsOpen ? <PriceLevelsDialog instrumentId={data.instrument.id} currency={data.instrument.currency} currentPrice={current?.close ?? null} levels={priceLevels} onClose={() => setPriceLevelsOpen(false)} onChanged={setPriceLevels} /> : null}
    {aiAnalysisOpen ? <AiAnalysisDialog instrumentId={data.instrument.id} symbol={data.instrument.symbol} name={data.instrument.name} configured={aiConfigured} configuredModel={aiModel} onClose={() => setAiAnalysisOpen(false)} /> : null}
  </div>;
}
