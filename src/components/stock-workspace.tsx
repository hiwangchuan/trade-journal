"use client";
import dynamic from "next/dynamic";
import { BarChart3, Database, Layers3, Plus, RefreshCw, RotateCcw, Settings2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import type { StockWorkspaceData, TradeWithAnalysis } from "@/types";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { TradeForm } from "./trades/trade-form";
import { TradeInspector } from "./trades/trade-inspector";
import { TradeTable } from "./trades/trade-table";
import { InstrumentSettingsDialog } from "./stocks/instrument-settings-dialog";

const StockChart = dynamic(() => import("./chart/stock-chart"), { ssr: false, loading: () => <div className="grid h-full place-items-center text-xs text-muted">Loading chart…</div> });

export function StockWorkspace({ data, twelveDataConfigured, eodhdConfigured }: { data: StockWorkspaceData; twelveDataConfigured: boolean; eodhdConfigured: boolean }) {
  const [trades, setTrades] = useState(data.trades); const [selected, setSelected] = useState<TradeWithAnalysis | null>(data.trades[0] ?? null);
  const [dialog, setDialog] = useState<{ date: string; price: number; trade?: TradeWithAnalysis | null } | null>(null); const [settingsOpen, setSettingsOpen] = useState(false); const [ma20, setMa20] = useState(true); const [ma60, setMa60] = useState(true); const [showTrades, setShowTrades] = useState(true); const [refreshing, setRefreshing] = useState(false); const [message, setMessage] = useState(""); const csvRef = useRef<HTMLInputElement>(null);
  const candles = data.candles; const current = candles.at(-1); const previous = candles.at(-2); const change = current && previous ? ((current.close / previous.close) - 1) * 100 : 0;
  const sourceName = data.instrument.dataProvider === "mock" ? "演示数据" : data.instrument.dataProvider === "twelve-data" ? "Twelve Data" : data.instrument.dataProvider === "eodhd" ? "EODHD" : candles.length ? "CSV 数据" : "暂无行情";
  const sourceLabel = `${sourceName} · ${data.instrument.priceAdjustment === "splits" ? "拆股复权" : "原始价格"}`;
  const select = useCallback((trade: TradeWithAnalysis) => setSelected(trade), []);
  const recordAt = useCallback((date: string, price: number) => setDialog({ date, price }), []);
  const save = (trade: TradeWithAnalysis) => { setTrades((items) => { const exists = items.some((item) => item.id === trade.id); return (exists ? items.map((item) => item.id === trade.id ? trade : item) : [trade, ...items]).sort((a,b) => b.tradeAt.localeCompare(a.tradeAt)); }); setSelected(trade); };
  async function remove() { if (!selected || !confirm("确定删除这笔交易及其分析结果吗？")) return; const response = await fetch(`/api/trades/${selected.id}`, { method: "DELETE" }); const json = await response.json(); if (response.ok) { setTrades((items) => items.filter((item) => item.id !== selected.id)); setSelected(null); } else setMessage(json.message ?? "无法删除交易。"); }
  async function refresh() { setRefreshing(true); setMessage(""); const response = await fetch("/api/market/refresh", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ instrumentId: data.instrument.id }) }); const json = await response.json(); if (response.ok) { setMessage(`已更新 ${json.count} 根 K 线。`); location.reload(); } else setMessage(json.message ?? "行情刷新失败。"); setRefreshing(false); }
  async function importCsv(file?: File) { if (!file) return; const csv = await file.text(); const response = await fetch("/api/market/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ instrumentId: data.instrument.id, csv }) }); const json = await response.json(); if (response.ok) { setMessage(`已导入 ${json.count} 条行情。`); location.reload(); } else setMessage(json.message ?? "导入失败。"); }
  const emptyMessage = data.instrument.dataProvider === "twelve-data" && !twelveDataConfigured
    ? "尚未配置 Twelve Data API Key。请前往“设置 → 行情 K 线”保存密钥，然后返回本页刷新。"
    : data.instrument.dataProvider === "eodhd" && !eodhdConfigured
      ? "尚未配置 EODHD API Key。请前往“设置 → 行情 K 线”保存港股数据密钥，然后返回本页刷新。"
    : data.instrument.dataProvider === "csv"
      ? "该股票使用 CSV 行情，请导入包含 date、open、high、low、close、volume 的文件。"
      : "点击刷新获取行情，或导入 OHLCV CSV 文件。";
  return <div className="stock-shell">
    <header className="stock-header"><div><div className="flex items-baseline gap-2"><h1 className="text-lg font-bold tracking-tight">{data.instrument.name}</h1><span className="text-sm text-muted">{data.instrument.symbol}</span></div><div className="mt-2 flex flex-wrap items-baseline gap-3"><span className="text-3xl font-bold tracking-[-.04em]">{current?.close.toFixed(2) ?? "—"}</span><span className="text-xs text-muted">{data.instrument.currency}</span>{current && previous ? <span className={change >= 0 ? "buy text-lg font-bold" : "sell text-lg font-bold"}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</span> : null}<Badge>{sourceLabel}</Badge>{data.instrument.marketDataStale ? <Badge tone="warning">配置已变更 · 待刷新</Badge> : null}<span className="text-[10px] text-muted">最新K线 {data.updatedAt ?? "从未"} · 上次刷新 {data.instrument.lastMarketRefreshAt?.slice(0, 16) ?? "从未"}</span></div></div><div className="flex flex-wrap justify-end gap-2"><Button onClick={() => setSettingsOpen(true)}><Settings2 size={14} /> 股票配置</Button><Button onClick={refresh} disabled={refreshing}><RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />{refreshing ? "正在刷新" : "刷新行情"}</Button><Button variant="primary" onClick={() => setDialog({ date: current?.time ?? new Date().toISOString().slice(0,10), price: current?.close ?? 0 })}><Plus size={14} /> 记录交易</Button>{message ? <span className="basis-full text-right text-[10px] text-muted">{message}</span> : null}</div></header>
    <div className="stock-toolbar"><Button className="shrink-0">日线</Button><Button title="显示或隐藏 20 日简单移动平均线" className={ma20 ? "border-blue-500/50 text-blue-400" : ""} onClick={() => setMa20((value) => !value)}><span className="h-px w-4 bg-blue-400" /> MA20</Button><Button title="显示或隐藏 60 日简单移动平均线" className={ma60 ? "border-yellow-500/50 text-yellow-400" : ""} onClick={() => setMa60((value) => !value)}><span className="h-px w-4 bg-yellow-400" /> MA60</Button><Button title="支撑位、阻力位和自定义价格线"><Layers3 size={13} /> 价格位</Button><Button className={showTrades ? "border-buy/50" : ""} onClick={() => setShowTrades((value) => !value)}>买/卖 ↕</Button><Button><BarChart3 size={13} /> 分析</Button><Button onClick={() => location.reload()}><RotateCcw size={13} /> 重置视图</Button><Button onClick={() => csvRef.current?.click()}><Database size={13} /> 导入 CSV</Button><input ref={csvRef} hidden type="file" accept=".csv,text/csv" onChange={(event) => importCsv(event.target.files?.[0])} /></div>
    <section className="chart-region">{candles.length ? <StockChart candles={candles} trades={trades} selectedId={selected?.id ?? null} showMa20={ma20} showMa60={ma60} showTrades={showTrades} levels={data.manualLevels} onSelect={select} onRecordAt={recordAt} /> : <div className="grid h-full place-items-center"><div className="max-w-sm text-center"><Database className="mx-auto mb-3 text-muted" /><h2 className="font-semibold">暂无 K 线数据</h2><p className="mt-2 text-xs leading-5 text-muted">{emptyMessage}</p><div className="mt-4 flex justify-center gap-2"><Button onClick={refresh} disabled={refreshing}>{refreshing ? "正在刷新" : "刷新行情"}</Button><Button onClick={() => csvRef.current?.click()}>导入 CSV</Button></div></div></div>}</section>
    <TradeInspector trade={selected} trades={trades} instrument={data.instrument} onClose={() => setSelected(null)} onEdit={() => selected && setDialog({ date: selected.tradeDate, price: Number(selected.price), trade: selected })} onDelete={remove} />
    <TradeTable trades={trades} selectedId={selected?.id ?? null} exitFeeModel={data.instrument.exitFeeModel} onSelect={select} />
    {dialog ? <TradeForm instrument={data.instrument} defaultDate={dialog.date} defaultPrice={dialog.price} trade={dialog.trade} onClose={() => setDialog(null)} onSaved={save} /> : null}
    {settingsOpen ? <InstrumentSettingsDialog instrument={data.instrument} onClose={() => setSettingsOpen(false)} onSaved={() => location.reload()} /> : null}
  </div>;
}
