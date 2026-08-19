import { ArrowDownRight, ArrowUpRight, ChevronRight, CircleGauge, Clock3, Target } from "lucide-react";
import Link from "next/link";
import { dashboardData } from "@/lib/data";
import { formatPct, formatPrice } from "@/lib/utils";
import { sideLabels } from "@/lib/display-labels";

export const dynamic = "force-dynamic";

export default function OverviewPage() {
  const { instruments, trades } = dashboardData();
  const buys = trades.filter((trade) => trade.side === "BUY" && trade.outcome?.return20d !== null);
  const sells = trades.filter((trade) => trade.side === "SELL" && trade.outcome?.sellMissedGain20d !== null);
  const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const buyAverage = average(buys.map((trade) => trade.outcome!.return20d!));
  const sellMissed = average(sells.map((trade) => trade.outcome!.sellMissedGain20d!));
  const nameById = new Map(instruments.map((item) => [item.id, item]));
  return <div className="page-wrap space-y-7">
    <section className="flex items-end justify-between gap-4"><div><h1 className="page-title">基于当时背景复盘，而不是事后判断。</h1><p className="mt-2 max-w-xl text-sm text-muted">专注记录下单时你掌握的信息，以及市场之后实际发生的变化。</p></div><Link className="control bg-buy text-white hover:bg-buy/85" href="/stocks/01810.HK">打开工作区 <ChevronRight size={14} /></Link></section>
    <section><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">最近交易</h2><Link href="/trades" className="text-xs text-muted hover:text-ink">查看全部</Link></div><div className="panel divide-y divide-line overflow-hidden">{trades.slice(0, 5).map((trade) => { const instrument = nameById.get(trade.instrumentId); return <Link href={`/stocks/${instrument?.symbol ?? ""}`} key={trade.id} className="flex min-h-14 items-center gap-4 px-4 hover:bg-elevated"><span className={trade.side === "BUY" ? "buy" : "sell"}>{trade.side === "BUY" ? <ArrowUpRight size={17} /> : <ArrowDownRight size={17} />}</span><span className="w-12 text-xs font-semibold">{sideLabels[trade.side]}</span><span className="min-w-24 font-semibold">{instrument?.symbol}</span><span className="hidden flex-1 text-xs text-muted sm:block">{trade.reason}</span><span className="font-mono text-xs">{formatPrice(trade.price)}</span><span className="w-20 text-right text-[11px] text-muted">{trade.tradeDate.slice(5)}</span></Link>; })}{!trades.length ? <div className="p-10 text-center text-muted">还没有交易记录，请进入股票工作区记录第一笔真实交易。</div> : null}</div></section>
    <section className="grid gap-4 md:grid-cols-2"><div className="panel p-5"><div className="flex items-center justify-between"><div><div className="text-xs text-muted">买入后市场表现 · 完整20日样本 {buys.length}</div><div className="mt-3 stat-value">{formatPct(buyAverage)}</div><div className="mt-1 text-xs text-muted">平均20日价格表现 · 非实际交易盈亏</div></div><div className="grid h-12 w-12 place-items-center rounded-full bg-buy/10 text-buy"><Target size={20} /></div></div><div className="mt-5 flex items-center gap-2 text-[11px] text-muted"><Clock3 size={13} /> 未满20根未来K线的买入不会进入统计。</div></div><div className="panel p-5"><div className="flex items-center justify-between"><div><div className="text-xs text-muted">卖出后走势 · 完整20日样本 {sells.length}</div><div className="mt-3 stat-value">{formatPct(sellMissed)}</div><div className="mt-1 text-xs text-muted">平均20日错过涨幅</div></div><div className="grid h-12 w-12 place-items-center rounded-full bg-yellow-500/10 text-yellow-500"><CircleGauge size={20} /></div></div><div className="mt-5 flex items-center gap-2 text-[11px] text-muted"><Clock3 size={13} /> 仅描述后续走势，不评价交易执行好坏。</div></div></section>
    <section><h2 className="mb-3 text-sm font-semibold">股票</h2><div className="panel overflow-hidden"><div className="grid divide-y divide-line">{instruments.map((instrument) => <Link key={instrument.id} href={`/stocks/${instrument.symbol}`} className="flex min-h-16 items-center gap-4 px-4 hover:bg-elevated"><div className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-elevated text-xs font-bold">{instrument.symbol.slice(0, 2)}</div><div className="min-w-0 flex-1"><div className="font-semibold">{instrument.symbol}</div><div className="truncate text-xs text-muted">{instrument.name}</div></div><span className="text-xs text-muted">{instrument.exchange}</span><ChevronRight size={15} className="text-muted" /></Link>)}</div></div></section>
  </div>;
}
