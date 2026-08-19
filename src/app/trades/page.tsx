import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { listInstruments, listTrades } from "@/lib/data";
import { formatPct } from "@/lib/utils";
import { calculatePositionCostTimeline } from "@/lib/trades/position-cost";
import { sideLabels, strategyLabel } from "@/lib/display-labels";

export const dynamic = "force-dynamic";
export default function TradesPage() {
  const instruments = listInstruments(); const instrumentMap = new Map(instruments.map((item) => [item.id, item])); const trades = listTrades();
  const tradesByInstrument = new Map<number, typeof trades>();
  for (const trade of trades) { const group = tradesByInstrument.get(trade.instrumentId) ?? []; group.push(trade); tradesByInstrument.set(trade.instrumentId, group); }
  const costs = new Map<number, ReturnType<typeof calculatePositionCostTimeline>[number]>();
  for (const instrument of instruments) for (const snapshot of calculatePositionCostTimeline(tradesByInstrument.get(instrument.id) ?? [], instrument.exitFeeModel)) costs.set(snapshot.tradeId, snapshot);
  return <div className="page-wrap"><div className="mb-6"><h1 className="page-title">交易</h1><p className="mt-2 text-sm text-muted">买入显示持仓周期资金回本价，卖出显示卖出前持仓成本线；全部包含相应手续费。</p></div><div className="panel overflow-x-auto"><table className="data-table"><thead><tr><th>日期</th><th>股票代码</th><th>方向</th><th>价格</th><th>数量</th><th>手续费</th><th>周期回本/成本线</th><th>策略</th><th>60 日位置</th><th>20 日价格表现</th></tr></thead><tbody>{trades.map((trade) => { const instrument = instrumentMap.get(trade.instrumentId); const cost = costs.get(trade.id); const breakEvenPrice = trade.side === "BUY" ? cost?.campaignBreakEvenPriceAfter : cost?.sellBreakEvenPrice; return <tr key={trade.id}><td><Link className="hover:underline" href={`/stocks/${instrument?.symbol}?trade=${trade.id}`}>{trade.tradeDate}</Link></td><td className="font-semibold">{instrument?.symbol}</td><td><span className={trade.side === "BUY" ? "buy inline-flex items-center gap-1" : "sell inline-flex items-center gap-1"}>{trade.side === "BUY" ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{sideLabels[trade.side]}</span></td><td>{Number(trade.price).toFixed(2)}</td><td>{trade.quantity}</td><td>{trade.side === "BUY" ? `${trade.fee} + ${trade.estimatedExitFee}（预计）` : trade.fee}</td><td className="font-semibold">{breakEvenPrice ?? "—"}</td><td className="text-muted">{strategyLabel(trade.strategy)}</td><td>{trade.snapshot?.range60Percentile === null ? "—" : `${Math.round((trade.snapshot?.range60Percentile ?? 0) * 100)}%`}</td><td className={(trade.outcome?.return20d ?? 0) >= 0 ? "buy" : "sell"}>{formatPct(trade.outcome?.return20d ?? null)}</td></tr>; })}</tbody></table></div></div>;
}
