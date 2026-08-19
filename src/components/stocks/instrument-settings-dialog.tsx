"use client";

import { X } from "lucide-react";
import { FormEvent, useState } from "react";
import type { Instrument } from "@/types";
import { Button } from "@/components/ui/button";

type Props = {
  instrument: Instrument;
  onClose: () => void;
  onSaved: (instrument: Instrument) => void;
};

export function InstrumentSettingsDialog({ instrument, onClose, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const body = Object.fromEntries(new FormData(event.currentTarget));

    try {
      const response = await fetch(`/api/instruments/${instrument.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.message ?? "无法保存股票配置。");
      onSaved(json.instrument);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法保存股票配置。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog max-w-[620px]" role="dialog" aria-modal="true" aria-label="股票配置">
        <form onSubmit={submit}>
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <h2 className="text-base font-semibold">股票配置</h2>
              <p className="mt-1 text-xs text-muted">已有交易不会改变；行情映射或复权口径变化后需要重新刷新 K 线。</p>
            </div>
            <Button type="button" variant="ghost" className="h-8 w-8 p-0" onClick={onClose} aria-label="关闭">
              <X size={16} />
            </Button>
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <label>
              <span className="label">股票代码</span>
              <input className="field cursor-not-allowed opacity-70" value={instrument.symbol} readOnly aria-readonly="true" />
              <span className="mt-1.5 block text-[10px] leading-4 text-muted">用于关联历史交易，暂不支持修改。</span>
            </label>
            <label>
              <span className="label">名称</span>
              <input className="field" name="name" required defaultValue={instrument.name} />
            </label>
            <label>
              <span className="label">市场</span>
              <input className="field" name="market" required defaultValue={instrument.market} />
            </label>
            <label>
              <span className="label">交易所</span>
              <input className="field" name="exchange" required defaultValue={instrument.exchange} />
            </label>
            <label>
              <span className="label">货币</span>
              <input className="field" name="currency" required defaultValue={instrument.currency} minLength={3} maxLength={6} />
            </label>
            <label>
              <span className="label">时区</span>
              <select className="field" name="timezone" defaultValue={instrument.timezone}>
                <option value="America/New_York">纽约</option>
                <option value="Asia/Hong_Kong">香港</option>
                <option value="Asia/Shanghai">上海</option>
                <option value="Europe/London">伦敦</option>
                <option value="Europe/Helsinki">赫尔辛基</option>
              </select>
            </label>
            <label>
              <span className="label">行情来源</span>
              <select className="field" name="dataProvider" defaultValue={instrument.dataProvider}>
                <option value="twelve-data">Twelve Data</option>
                <option value="eodhd">EODHD · 港股</option>
                <option value="csv">手动导入 CSV</option>
                <option value="mock">演示数据</option>
              </select>
            </label>
            <label>
              <span className="label">行情代码</span>
              <input className="field" name="providerSymbol" required defaultValue={instrument.providerSymbol || instrument.symbol} />
              <span className="mt-1.5 block text-[10px] leading-4 text-muted">Twelve Data 示例：QQQ；EODHD 港股示例：1810.HK。</span>
            </label>
            <label>
              <span className="label">历史价格口径</span>
              <select className="field" name="priceAdjustment" defaultValue={instrument.priceAdjustment}>
                <option value="splits">拆股复权 · 推荐</option>
                <option value="raw">原始价格</option>
              </select>
              <span className="mt-1.5 block text-[10px] leading-4 text-muted">EODHD 拆股复权需要支持 Technical API 的套餐。</span>
            </label>
            <div className="sm:col-span-2 rounded-lg border border-line bg-canvas/40 p-4">
              <div className="text-xs font-semibold">预计平仓手续费模型</div>
              <p className="mt-1 text-[10px] leading-4 text-muted">用于动态计算当前剩余持仓一次性卖出的手续费。公式：max(成交额 × 费率, 最低收费) + 固定费用；全部填 0 时使用交易中手动填写的预计费用。</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label><span className="label">费率（%）</span><input className="field" name="exitFeeRatePct" type="number" min="0" max="99.9999" step="0.0001" defaultValue={instrument.exitFeeModel.ratePct} /></label>
                <label><span className="label">固定费用</span><input className="field" name="exitFeeFixed" type="number" min="0" step="0.01" defaultValue={instrument.exitFeeModel.fixed} /></label>
                <label><span className="label">最低收费</span><input className="field" name="exitFeeMinimum" type="number" min="0" step="0.01" defaultValue={instrument.exitFeeModel.minimum} /></label>
              </div>
            </div>
            {error ? <div className="rounded-md bg-sell/10 p-3 text-xs text-sell sm:col-span-2">{error}</div> : null}
          </div>
          <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
            <Button type="button" onClick={onClose}>取消</Button>
            <Button type="submit" variant="primary" disabled={saving}>{saving ? "正在保存…" : "保存配置"}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
