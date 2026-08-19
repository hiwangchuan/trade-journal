import { TermTooltip } from "@/components/ui/term-tooltip";
import { Button } from "@/components/ui/button";
import { buildClosedCampaigns, campaignMetrics } from "@/lib/analysis/campaign-analysis";
import { listInstruments, listTrades } from "@/lib/data";
import { strategyLabel } from "@/lib/display-labels";
import { termGlossary } from "@/lib/term-glossary";
import { formatPct } from "@/lib/utils";
import type { TradeWithAnalysis } from "@/types";

export const dynamic = "force-dynamic";
type Bucket = { label: string; min: number; max: number };
const rangeBuckets: Bucket[] = [{ label: "跌破区间低点", min: -Infinity, max: 0 }, { label: "0–25%", min: 0, max: .25 }, { label: "25–50%", min: .25, max: .5 }, { label: "50–75%", min: .5, max: .75 }, { label: "75–100%", min: .75, max: 1.000001 }, { label: "突破区间高点", min: 1.000001, max: Infinity }];
const maBuckets: Bucket[] = [{ label: "< -5%", min: -Infinity, max: -5 }, { label: "-5–0%", min: -5, max: 0 }, { label: "0–5%", min: 0, max: 5 }, { label: "5–10%", min: 5, max: 10 }, { label: "> 10%", min: 10, max: Infinity }];
const resistanceBuckets: Bucket[] = [{ label: "0–2%", min: 0, max: 2 }, { label: "2–5%", min: 2, max: 5 }, { label: "5–10%", min: 5, max: 10 }, { label: "> 10%", min: 10, max: Infinity }];
const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const median = (values: number[]) => { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; };

function GroupTable({ title, description, buckets, buys, value }: { title: string; description: string; buckets: Bucket[]; buys: TradeWithAnalysis[]; value: (trade: TradeWithAnalysis) => number | null }) {
  return <section><h2 className="mb-3 text-sm font-semibold"><TermTooltip term={title} description={description} /></h2><div className="panel overflow-x-auto"><table className="data-table"><thead><tr><th>分组</th><th>有效/全部</th><th>平均20日价格表现</th><th>上涨比例</th><th>平均MFE20</th><th>平均MAE20</th></tr></thead><tbody>{buckets.map((bucket) => {
    const items = buys.filter((trade) => { const metric = value(trade); return metric !== null && metric >= bucket.min && metric < bucket.max; });
    const completed = items.filter((trade) => trade.outcome?.return20d != null && trade.outcome.mfe20d != null && trade.outcome.mae20d != null);
    const returns = completed.map((trade) => trade.outcome!.return20d!);
    const winRate = returns.length ? returns.filter((item) => item > 0).length / returns.length * 100 : null;
    return <tr key={bucket.label}><td className="font-semibold">{bucket.label}</td><td>{completed.length}/{items.length}</td><td>{formatPct(mean(returns))}</td><td>{formatPct(winRate)}</td><td className="buy">{formatPct(mean(completed.map((trade) => trade.outcome!.mfe20d!)))}</td><td className="sell">{formatPct(mean(completed.map((trade) => trade.outcome!.mae20d!)))}</td></tr>;
  })}</tbody></table></div></section>;
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ instrument?: string; strategy?: string }> }) {
  const params = await searchParams;
  const instruments = listInstruments();
  const allTrades = listTrades();
  const selectedInstrumentId = params.instrument && params.instrument !== "all" ? Number(params.instrument) : null;
  const selectedStrategy = params.strategy && params.strategy !== "all" ? params.strategy : null;
  const instrumentTrades = allTrades.filter((trade) => !selectedInstrumentId || trade.instrumentId === selectedInstrumentId);
  const trades = instrumentTrades.filter((trade) => !selectedStrategy || (trade.strategy ?? "Manual") === selectedStrategy);
  const buys = trades.filter((trade) => trade.side === "BUY");
  const sells = trades.filter((trade) => trade.side === "SELL");
  const completedBuys = buys.filter((trade) => trade.outcome?.return20d != null && trade.outcome.mfe20d != null && trade.outcome.mae20d != null);
  const returns = completedBuys.map((trade) => trade.outcome!.return20d!);
  const completedSells = sells.filter((trade) => trade.outcome?.sellMissedGain20d != null);
  const missed = completedSells.map((trade) => trade.outcome!.sellMissedGain20d!);
  const campaigns = buildClosedCampaigns(instrumentTrades).filter((campaign) => !selectedStrategy || campaign.strategy === selectedStrategy);
  const campaignStats = campaignMetrics(campaigns);
  const instrumentMap = new Map(instruments.map((instrument) => [instrument.id, instrument]));
  const strategies = [...new Set(allTrades.map((trade) => trade.strategy ?? "Manual"))].sort();
  const currencies = new Set(trades.map((trade) => trade.currency));
  const nearResistanceEligible = sells.filter((trade) => trade.snapshot?.distanceToPivotHighPct != null);
  const belowMa20Eligible = sells.filter((trade) => trade.snapshot?.distanceToMa20Pct != null);
  const nearResistance = nearResistanceEligible.filter((trade) => trade.snapshot!.distanceToPivotHighPct! <= 3).length;
  const belowMa20 = belowMa20Eligible.filter((trade) => trade.snapshot!.distanceToMa20Pct! < 0).length;
  const profitFactor = currencies.size !== 1 ? "—" : campaignStats.profitFactor === Infinity ? "∞" : campaignStats.profitFactor === null ? "—" : campaignStats.profitFactor.toFixed(2);

  return <div className="page-wrap space-y-7">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="page-title">分析</h1><p className="mt-2 text-sm text-muted">先看已平仓周期的真实净收益，再独立观察入场后市场表现。</p></div><form className="flex flex-wrap gap-2"><select className="field min-w-36" name="instrument" defaultValue={params.instrument ?? "all"}><option value="all">全部股票</option>{instruments.map((instrument) => <option key={instrument.id} value={instrument.id}>{instrument.symbol}</option>)}</select><select className="field min-w-36" name="strategy" defaultValue={params.strategy ?? "all"}><option value="all">全部策略</option>{strategies.map((strategy) => <option key={strategy} value={strategy}>{strategyLabel(strategy)}</option>)}</select><Button type="submit">应用筛选</Button></form></div>

    <section><div className="mb-3 flex flex-col items-start gap-2 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-sm font-semibold">已平仓持仓周期</h2><p className="mt-1 text-xs text-muted">净盈亏已扣除实际买卖手续费；分批买卖合并为一次持仓周期。</p></div><span className="shrink-0 text-xs text-muted">{campaigns.length} 个有效周期</span></div>
      <div className="analytics-grid">{[
        ["周期胜率", formatPct(campaignStats.winRate)], ["平均净收益率", formatPct(campaignStats.averageReturnPct)], ["Profit Factor", profitFactor], ["平均 R 倍数", campaignStats.averageR === null ? "—" : `${campaignStats.averageR.toFixed(2)}R`], ["平均持仓天数", campaignStats.averageHoldingDays === null ? "—" : `${campaignStats.averageHoldingDays.toFixed(1)} 天`], ["最大累计回撤", currencies.size === 1 && campaigns.length ? `${campaignStats.maxDrawdown.toFixed(2)} ${[...currencies][0]}` : "—"],
      ].map(([label, value]) => <div className="analytics-stat" key={label}><div className="text-[11px] text-muted">{label}</div><div className="mt-2 text-xl font-bold tracking-tight">{value}</div></div>)}</div>
      {campaigns.length < 20 ? <p className="mt-3 rounded-lg border border-yellow-500/20 bg-yellow-500/[.06] p-3 text-xs leading-5 text-yellow-200">当前完整周期少于20个，只适合逐笔复盘，不足以判断策略是否具有稳定优势。R倍数仅统计记录了有效计划止损的周期（{campaignStats.rSampleCount}/{campaigns.length}）。</p> : null}
      {campaigns.length ? <div className="panel mt-3 overflow-x-auto"><table className="data-table"><thead><tr><th>标的</th><th>周期</th><th>开仓</th><th>平仓</th><th>净收益率</th><th>净盈亏</th><th>R倍数</th><th>持仓</th></tr></thead><tbody>{campaigns.map((campaign) => <tr key={`${campaign.instrumentId}:${campaign.accountId}:${campaign.campaignNumber}`}><td>{instrumentMap.get(campaign.instrumentId)?.symbol ?? campaign.instrumentId}</td><td>#{campaign.campaignNumber}</td><td>{campaign.openedAt.slice(0, 10)}</td><td>{campaign.closedAt.slice(0, 10)}</td><td className={campaign.returnPct >= 0 ? "buy" : "sell"}>{formatPct(campaign.returnPct)}</td><td>{campaign.netPnl.toFixed(2)} {instrumentMap.get(campaign.instrumentId)?.currency}</td><td>{campaign.rMultiple === null ? "—" : `${campaign.rMultiple.toFixed(2)}R`}</td><td>{campaign.holdingDays} 天</td></tr>)}</tbody></table></div> : null}
    </section>

    <section><div className="mb-3"><h2 className="text-sm font-semibold">入场后20日市场表现</h2><p className="mt-1 text-xs text-muted">这是成交价之后的价格路径，不是实际交易胜率，也没有代替已平仓周期盈亏。</p></div><div className="analytics-grid">{[["买入事件", String(buys.length)], ["完整20日样本", String(completedBuys.length)], ["平均20日价格表现", formatPct(mean(returns))], ["20日价格中位数", formatPct(median(returns))], ["20日上涨比例", formatPct(returns.length ? returns.filter((value) => value > 0).length / returns.length * 100 : null)]].map(([label, value]) => <div className="analytics-stat" key={label}><div className="text-[11px] text-muted">{label}</div><div className="mt-2 text-xl font-bold tracking-tight">{value}</div></div>)}</div></section>
    <GroupTable title="买入分析 · 60日区间位置" description={termGlossary.rangePosition} buckets={rangeBuckets} buys={buys} value={(trade) => trade.snapshot?.range60Percentile ?? null} />
    <GroupTable title="买入分析 · 距MA20" description={termGlossary.ma20} buckets={maBuckets} buys={buys} value={(trade) => trade.snapshot?.distanceToMa20Pct ?? null} />
    <GroupTable title="买入分析 · 距有效阻力位" description={termGlossary.resistance} buckets={resistanceBuckets} buys={buys} value={(trade) => trade.snapshot?.distanceToPivotHighPct ?? null} />
    <section><h2 className="mb-3 text-sm font-semibold">卖出后市场表现</h2><div className="grid overflow-hidden rounded-[10px] border border-line bg-surface sm:grid-cols-4"><div className="analytics-stat"><div className="text-[11px] text-muted">卖出事件</div><div className="mt-2 text-xl font-bold">{sells.length}</div></div><div className="analytics-stat"><div className="text-[11px] text-muted">完整20日样本</div><div className="mt-2 text-xl font-bold">{completedSells.length}</div></div><div className="analytics-stat"><div className="text-[11px] text-muted">平均20日错过涨幅</div><div className="mt-2 text-xl font-bold">{formatPct(mean(missed))}</div></div><div className="analytics-stat"><div className="text-[11px] text-muted">接近有效阻力卖出</div><div className="mt-2 text-xl font-bold">{formatPct(nearResistanceEligible.length ? nearResistance / nearResistanceEligible.length * 100 : null)}</div></div><div className="analytics-stat"><div className="text-[11px] text-muted">MA20下方卖出</div><div className="mt-2 text-xl font-bold">{formatPct(belowMa20Eligible.length ? belowMa20 / belowMa20Eligible.length * 100 : null)}</div></div></div></section>
  </div>;
}
