"use client";

import { Database, RefreshCw, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { StockWorkspaceData } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Series = NonNullable<StockWorkspaceData["marketData"]> & {
  instrumentId: number;
  interval: string;
  currency: string;
  exchange: string;
  timezone: string;
  isActive: boolean;
};

type SyncRun = {
  id: number;
  mode: string;
  status: string;
  returnedCount: number;
  insertedCount: number;
  updatedCount: number;
  unchangedCount: number;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
};

type Details = { series: Series[]; syncRuns: SyncRun[] };
type SyncMode = "incremental" | "backfill" | "reconcile";

const statusLabels: Record<string, string> = {
  HEALTHY: "正常", EMPTY: "暂无数据", REVIEW: "需要检查", STALE: "同步失败", ERROR: "不可用",
};
const modeLabels: Record<string, string> = { incremental: "增量", backfill: "完整回填", reconcile: "深度校验", csv: "CSV导入" };

function formatTime(value: string | null) {
  return value ? value.replace("T", " ").slice(0, 16) : "—";
}

export function MarketDataDialog({ instrumentId, summary, onClose }: {
  instrumentId: number;
  summary: StockWorkspaceData["marketData"];
  onClose: () => void;
}) {
  const [details, setDetails] = useState<Details | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<SyncMode | null>(null);
  const [message, setMessage] = useState("");

  async function loadDetails() {
    const response = await fetch(`/api/instruments/${instrumentId}/market-data`);
    const json = await response.json();
    if (!response.ok) throw new Error(json.message ?? "无法读取行情数据状态。");
    setDetails(json);
  }

  useEffect(() => {
    loadDetails().catch((cause) => setMessage(cause instanceof Error ? cause.message : "无法读取行情数据状态。")).finally(() => setLoading(false));
  }, [instrumentId]);

  async function sync(mode: SyncMode) {
    setRunning(mode);
    setMessage("");
    try {
      const response = await fetch("/api/market/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instrumentId, mode }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.message ?? "行情同步失败。");
      setMessage(`同步完成：新增 ${json.inserted} 根，修正 ${json.updated} 根，本地累计 ${json.total} 根。`);
      await loadDetails();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "行情同步失败。");
    } finally {
      setRunning(null);
    }
  }

  const active = details?.series.find((item) => item.isActive) ?? summary;
  const healthy = active?.status === "HEALTHY";

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="dialog max-w-[820px]" role="dialog" aria-modal="true" aria-label="行情数据管理">
        <div className="flex items-start justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold"><Database size={17} /> 行情数据管理</h2>
            <p className="mt-1 text-xs text-muted">本地K线按数据源与复权口径独立累计，同步失败不会删除历史数据。</p>
          </div>
          <Button variant="ghost" className="h-8 w-8 p-0" onClick={onClose} aria-label="关闭"><X size={16} /></Button>
        </div>

        <div className="grid gap-4 p-5">
          <section className="grid gap-3 rounded-lg border border-line bg-canvas/35 p-4 sm:grid-cols-4">
            <div><div className="label">数据状态</div><div className="flex items-center gap-2">{healthy ? <ShieldCheck className="text-buy" size={16} /> : <TriangleAlert className="text-yellow-500" size={16} />}<span className="font-semibold">{statusLabels[active?.status ?? "EMPTY"] ?? active?.status ?? "暂无数据"}</span></div></div>
            <div><div className="label">本地数据量</div><div className="font-semibold">{active?.candleCount.toLocaleString() ?? 0} 根</div></div>
            <div><div className="label">历史范围</div><div className="text-xs font-semibold">{active?.earliestDate ?? "—"}<br />{active?.latestDate ?? "—"}</div></div>
            <div><div className="label">数据版本</div><div className="font-semibold">r{active?.dataRevision ?? 0}</div><div className="mt-1 text-[10px] text-muted">上次成功 {formatTime(active?.lastSuccessAt ?? null)}</div></div>
            {active?.qualityMessage ? <div className="rounded-md bg-yellow-500/10 p-3 text-xs leading-5 text-yellow-600 dark:text-yellow-400 sm:col-span-4">{active.qualityMessage}</div> : null}
          </section>

          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div><h3 className="text-sm font-semibold">同步操作</h3><p className="mt-1 text-[10px] text-muted">日常使用增量同步；完整回填用于新数据源；深度校验会重新核对当前可访问历史。</p></div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => sync("incremental")} disabled={running !== null}><RefreshCw size={13} className={running === "incremental" ? "animate-spin" : ""} />增量同步</Button>
                <Button onClick={() => sync("backfill")} disabled={running !== null}>完整回填</Button>
                <Button onClick={() => sync("reconcile")} disabled={running !== null}>深度校验</Button>
              </div>
            </div>
            {message ? <div className="rounded-md border border-line bg-canvas/40 p-3 text-xs leading-5">{message}</div> : null}
          </section>

          <section className="overflow-hidden rounded-lg border border-line">
            <div className="border-b border-line px-4 py-3 text-xs font-semibold">数据系列</div>
            <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>状态</th><th>来源</th><th>代码</th><th>口径</th><th>范围</th><th>数量</th></tr></thead><tbody>
              {(details?.series ?? []).map((series) => <tr key={series.id}><td>{series.isActive ? <Badge tone="buy">当前使用</Badge> : <Badge>已归档</Badge>}</td><td>{series.provider}</td><td>{series.providerSymbol}</td><td>{series.adjustment === "splits" ? "拆股复权" : "原始价格"}</td><td>{series.earliestDate ?? "—"} ～ {series.latestDate ?? "—"}</td><td>{series.candleCount.toLocaleString()}</td></tr>)}
              {!loading && !details?.series.length ? <tr><td colSpan={6} className="text-center text-muted">暂无数据系列</td></tr> : null}
            </tbody></table></div>
          </section>

          <section className="overflow-hidden rounded-lg border border-line">
            <div className="border-b border-line px-4 py-3 text-xs font-semibold">最近同步记录</div>
            <div className="max-h-56 overflow-auto"><table className="data-table"><thead><tr><th>时间</th><th>模式</th><th>结果</th><th>新增</th><th>修正</th><th>说明</th></tr></thead><tbody>
              {(details?.syncRuns ?? []).map((run) => <tr key={run.id}><td>{formatTime(run.startedAt)}</td><td>{modeLabels[run.mode] ?? run.mode}</td><td className={run.status === "SUCCESS" ? "buy" : "sell"}>{run.status === "SUCCESS" ? "成功" : "失败"}</td><td>{run.insertedCount}</td><td>{run.updatedCount}</td><td className="max-w-72 truncate text-muted">{run.errorMessage ?? `返回 ${run.returnedCount} · 未变化 ${run.unchangedCount}`}</td></tr>)}
              {!loading && !details?.syncRuns.length ? <tr><td colSpan={6} className="text-center text-muted">暂无同步记录</td></tr> : null}
            </tbody></table></div>
          </section>
        </div>
        <div className="flex justify-between border-t border-line px-5 py-4"><span className="self-center text-[10px] text-muted">完成同步后关闭并刷新页面即可查看最新K线。</span><Button onClick={() => location.reload()} variant="primary">刷新页面</Button></div>
      </div>
    </div>
  );
}
