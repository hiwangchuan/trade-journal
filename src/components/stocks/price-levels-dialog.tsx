"use client";

import { Archive, History, Pencil, Plus, RotateCcw, X } from "lucide-react";
import { FormEvent, useState } from "react";
import type { PriceLevel, PriceLevelType } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TermTooltip } from "@/components/ui/term-tooltip";
import { termGlossary } from "@/lib/term-glossary";

type Props = {
  instrumentId: number;
  currency: string;
  currentPrice: number | null;
  levels: PriceLevel[];
  onClose: () => void;
  onChanged: (levels: PriceLevel[]) => void;
};

const typeLabels: Record<PriceLevelType, string> = { SUPPORT: "支撑位", RESISTANCE: "阻力位", CUSTOM: "观察位" };
const actionLabels = { CREATED: "创建", UPDATED: "修改", ARCHIVED: "归档", RESTORED: "恢复" } as const;
const statusLabels = { WAITING: "等待验证", TOUCHED: "已经触及", BROKEN: "已经破位", ARCHIVED: "已归档" } as const;
const emptyDraft = (price: number | null) => ({ price: price ? price.toFixed(4) : "", type: "SUPPORT" as PriceLevelType, label: "", note: "" });
const formatPct = (value: number | null) => value === null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

export function PriceLevelsDialog({ instrumentId, currency, currentPrice, levels, onClose, onChanged }: Props) {
  const [tab, setTab] = useState<"active" | "history">("active");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState(() => emptyDraft(currentPrice));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const activeLevels = levels.filter((level) => level.active);

  function resetForm() {
    setEditingId(null);
    setDraft(emptyDraft(currentPrice));
    setError("");
  }

  function edit(level: PriceLevel) {
    setTab("active");
    setEditingId(level.id);
    setDraft({ price: String(level.price), type: level.type, label: level.label, note: level.note });
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(editingId ? `/api/price-levels/${editingId}` : `/api/instruments/${instrumentId}/price-levels`, {
        method: editingId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.message ?? "无法保存价格位。");
      onChanged(json.levels);
      resetForm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法保存价格位。");
    } finally {
      setSaving(false);
    }
  }

  async function mutate(id: number, action: "archive" | "restore") {
    if (action === "archive" && !confirm("确定归档这个价格位吗？历史版本会保留，并可从版本记录中恢复。")) return;
    setError("");
    try {
      const response = await fetch(`/api/price-levels/${id}`, action === "archive"
        ? { method: "DELETE" }
        : { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "RESTORE" }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.message ?? "价格位操作失败。");
      onChanged(json.levels);
      if (editingId === id) resetForm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "价格位操作失败。");
    }
  }

  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="dialog max-w-[880px]" role="dialog" aria-modal="true" aria-label="价格位管理">
      <div className="flex items-start justify-between border-b border-line px-5 py-4">
        <div><h2 className="text-base font-semibold">价格位管理</h2><p className="mt-1 text-xs leading-5 text-muted">记录当时的支撑、阻力与观察假设；新版本只从当前最新行情日起生效。</p></div>
        <Button variant="ghost" className="h-8 w-8 p-0" onClick={onClose} aria-label="关闭"><X size={16} /></Button>
      </div>
      <div className="grid min-h-[470px] md:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 border-b border-line md:border-b-0 md:border-r">
          <div className="tab-list"><button className={`tab-button ${tab === "active" ? "active" : ""}`} onClick={() => setTab("active")}>有效价格位 ({activeLevels.length})</button><button className={`tab-button ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")}><History className="mr-1 inline" size={12} />版本记录</button></div>
          <div className="max-h-[570px] space-y-3 overflow-y-auto p-4">
            {tab === "active" ? activeLevels.map((level) => <div key={level.id} className="rounded-lg border border-line bg-canvas/35 p-3">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge tone={level.type === "SUPPORT" ? "buy" : level.type === "RESISTANCE" ? "sell" : "neutral"}>{typeLabels[level.type]}</Badge><span className="truncate text-sm font-semibold">{level.label}</span><Badge tone={level.stats.status === "BROKEN" ? "sell" : level.stats.status === "TOUCHED" ? "warning" : "neutral"}>{statusLabels[level.stats.status]}</Badge></div><div className="mt-2 text-xl font-bold tracking-tight">{level.price.toFixed(4)} <small className="text-[10px] font-normal text-muted">{currency}</small></div></div><div className="flex gap-1"><Button className="h-8 w-8 p-0" aria-label={`编辑 ${level.label}`} onClick={() => edit(level)}><Pencil size={13} /></Button><Button variant="danger" className="h-8 w-8 p-0" aria-label={`归档 ${level.label}`} onClick={() => mutate(level.id, "archive")}><Archive size={13} /></Button></div></div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-4"><div><span className="block text-muted">现价距离</span><b>{formatPct(level.stats.currentDistancePct)}</b></div><div><span className="block text-muted"><TermTooltip term="触及次数" description={termGlossary.priceLevelTouch} /></span><b>{level.stats.touchCount}</b></div><div><span className="block text-muted">首次触及</span><b>{level.stats.firstTouchDate ?? "—"}</b></div><div><span className="block text-muted"><TermTooltip term="首次破位" description={termGlossary.priceLevelBreak} /></span><b>{level.stats.firstBreakDate ?? "—"}</b></div></div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-line/70 pt-2 text-[10px]"><span className="text-muted"><TermTooltip term="首次触及后" description="从首次触及日收盘价开始，计算之后第5、20、60个交易日的价格涨跌；不包含任何交易手续费。" />：</span><span>5日 <b>{formatPct(level.stats.return5d)}</b></span><span>20日 <b>{formatPct(level.stats.return20d)}</b></span><span>60日 <b>{formatPct(level.stats.return60d)}</b></span></div>
              {level.note ? <p className="mt-2 text-[10px] leading-4 text-muted">{level.note}</p> : null}<p className="mt-2 text-[9px] text-muted">生效 {level.startDate} · 第 {level.revision} 版</p>
            </div>) : levels.map((level) => <div key={level.id} className="rounded-lg border border-line bg-canvas/35 p-3">
              <div className="flex items-center justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold">{level.label}</span><Badge tone={level.active ? "buy" : "neutral"}>{level.active ? "有效" : "已归档"}</Badge></div><p className="mt-1 text-[10px] text-muted">共 {level.versions.length} 个不可变版本</p></div>{!level.active ? <Button onClick={() => mutate(level.id, "restore")}><RotateCcw size={12} /> 恢复</Button> : null}</div>
              <div className="mt-3 space-y-2 border-l border-line pl-3">{[...level.versions].reverse().map((version) => <div key={version.id} className="text-[10px]"><div className="flex flex-wrap items-center gap-2"><b>v{version.revision}</b><span>{actionLabels[version.action]}</span><span className="text-muted">{version.effectiveDate} 生效</span><span>{version.price.toFixed(4)}</span></div>{version.label !== level.label || version.note ? <p className="mt-1 text-muted">{version.label}{version.note ? ` · ${version.note}` : ""}</p> : null}</div>)}</div>
            </div>)}
            {(tab === "active" ? activeLevels : levels).length === 0 ? <div className="grid min-h-[240px] place-items-center rounded-lg border border-dashed border-line text-center"><div><p className="text-sm font-semibold">{tab === "active" ? "还没有有效价格位" : "还没有版本记录"}</p><p className="mt-1 text-xs text-muted">在右侧填写价格和当时的判断。</p></div></div> : null}
          </div>
        </div>
        <form className="p-4" onSubmit={submit}>
          <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">{editingId ? "生成新版本" : "新增价格位"}</h3>{editingId ? <Button type="button" variant="ghost" onClick={resetForm}>取消编辑</Button> : null}</div>
          <div className="mt-4 space-y-4">
            <label><span className="label">类型</span><select className="field" value={draft.type} onChange={(event) => setDraft((value) => ({ ...value, type: event.target.value as PriceLevelType }))}><option value="SUPPORT">支撑位</option><option value="RESISTANCE">阻力位</option><option value="CUSTOM">观察位</option></select></label>
            <label><span className="label">价格（{currency}）</span><input className="field" type="number" min="0.000001" step="any" required value={draft.price} onChange={(event) => setDraft((value) => ({ ...value, price: event.target.value }))} /></label>
            <label><span className="label">名称</span><input className="field" maxLength={40} required placeholder="例如：前高突破确认" value={draft.label} onChange={(event) => setDraft((value) => ({ ...value, label: event.target.value }))} /></label>
            <label><span className="label">当时的判断</span><textarea className="field min-h-24 resize-y py-2" maxLength={500} placeholder="记录这个价位为什么重要，以及什么情况代表假设失效。" value={draft.note} onChange={(event) => setDraft((value) => ({ ...value, note: event.target.value }))} /></label>
            {error ? <div className="rounded-md bg-sell/10 p-3 text-xs text-sell">{error}</div> : null}
            <Button type="submit" variant="primary" className="w-full" disabled={saving}>{editingId ? <Pencil size={13} /> : <Plus size={13} />}{saving ? "正在保存…" : editingId ? "保存为新版本" : "新增价格位"}</Button>
            <p className="text-[10px] leading-4 text-muted"><TermTooltip term="版本与生效日" description={termGlossary.priceLevelVersion} />由系统锁定。该功能只用于分析与预测，不连接券商，也不会创建订单。</p>
          </div>
        </form>
      </div>
    </div>
  </div>;
}
