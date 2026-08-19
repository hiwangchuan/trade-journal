"use client";
import { ChartCandlestick, ChevronRight, Database, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import type { Instrument } from "@/types";
import { Button } from "@/components/ui/button";

type Props = { instruments: Instrument[]; tradeCounts: Record<number, number> };

export function StockDirectory({ instruments, tradeCounts }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError("");
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    try {
      const response = await fetch("/api/instruments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.message ?? "无法添加股票。");
      setOpen(false);
      router.push(`/stocks/${encodeURIComponent(json.instrument.symbol)}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法添加股票。");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <div className="mb-6 flex items-end justify-between gap-4"><div><h1 className="page-title">股票</h1><p className="mt-2 text-sm text-muted">管理本地关注标的和历史交易复盘工作区。</p></div><Button variant="primary" onClick={() => { setError(""); setOpen(true); }}><Plus size={14} /> 添加股票</Button></div>
    <div className="panel overflow-hidden"><div className="grid grid-cols-[1fr_auto_auto] border-b border-line px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-muted"><span>股票</span><span className="w-24">交易</span><span className="w-8" /></div>{instruments.map((instrument) => <Link href={`/stocks/${instrument.symbol}`} key={instrument.id} className="grid min-h-20 grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-line px-4 last:border-0 hover:bg-elevated"><div className="flex min-w-0 items-center gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line bg-elevated"><ChartCandlestick size={18} className="text-buy" /></div><div className="min-w-0"><div className="font-semibold">{instrument.symbol}</div><div className="mt-1 truncate text-xs text-muted">{instrument.name} · {instrument.exchange} · {instrument.currency}</div></div></div><div className="w-24 text-xs text-muted">{tradeCounts[instrument.id] ?? 0} 笔</div><ChevronRight size={15} className="w-8 text-muted" /></Link>)}{!instruments.length ? <div className="p-12 text-center"><Database className="mx-auto mb-3 text-muted" /><div className="font-semibold">还没有股票</div><p className="mt-2 text-xs text-muted">请先添加股票，再导入 OHLCV CSV 或连接行情服务。</p></div> : null}</div>
    {open ? <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}><div className="dialog max-w-[620px]" role="dialog" aria-modal="true" aria-label="添加股票"><form onSubmit={submit}><div className="flex items-center justify-between border-b border-line px-5 py-4"><div><h2 className="text-base font-semibold">添加股票</h2><p className="mt-1 text-xs text-muted">手动创建本地工作区，API Key 始终保留在服务端。</p></div><Button type="button" variant="ghost" className="h-8 w-8 p-0" onClick={() => setOpen(false)} aria-label="关闭"><X size={16} /></Button></div><div className="grid gap-4 p-5 sm:grid-cols-2">
      <label><span className="label">股票代码</span><input className="field" name="symbol" required placeholder="例如 SPY" autoCapitalize="characters" /></label><label><span className="label">名称</span><input className="field" name="name" required placeholder="股票或基金名称" /></label>
      <label><span className="label">市场</span><input className="field" name="market" required defaultValue="US" /></label><label><span className="label">交易所</span><input className="field" name="exchange" required defaultValue="NASDAQ" /></label>
      <label><span className="label">货币</span><input className="field" name="currency" required defaultValue="USD" maxLength={3} /></label><label><span className="label">时区</span><select className="field" name="timezone" defaultValue="America/New_York"><option value="America/New_York">纽约</option><option value="Asia/Hong_Kong">香港</option><option value="Asia/Shanghai">上海</option><option value="Europe/London">伦敦</option><option value="Europe/Helsinki">赫尔辛基</option></select></label>
      <label><span className="label">行情来源</span><select className="field" name="dataProvider" defaultValue="csv"><option value="csv">手动导入 CSV</option><option value="twelve-data">Twelve Data</option><option value="eodhd">EODHD · 港股</option><option value="mock">演示数据</option></select></label><label><span className="label">行情代码</span><input className="field" name="providerSymbol" placeholder="默认与股票代码相同" /></label>
      <label><span className="label">历史价格口径</span><select className="field" name="priceAdjustment" defaultValue="splits"><option value="splits">拆股复权 · 推荐</option><option value="raw">原始价格</option></select></label><div className="hidden"><input name="exitFeeRatePct" value="0" readOnly /><input name="exitFeeFixed" value="0" readOnly /><input name="exitFeeMinimum" value="0" readOnly /></div>
      {error ? <div className="rounded-md bg-sell/10 p-3 text-xs text-sell sm:col-span-2">{error}</div> : null}
    </div><div className="flex justify-end gap-2 border-t border-line px-5 py-4"><Button type="button" onClick={() => setOpen(false)}>取消</Button><Button type="submit" variant="primary" disabled={saving}>{saving ? "正在添加…" : "添加股票"}</Button></div></form></div></div> : null}
  </>;
}
