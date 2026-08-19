"use client";
import { Download, KeyRound, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "./ui/button";

const themeLabels: Record<string, string> = { dark: "深色", light: "浅色", system: "跟随系统" };

type MarketProvider = "twelve-data" | "eodhd";

export function SettingsClient({ twelveDataConfigured, eodhdConfigured }: { twelveDataConfigured: boolean; eodhdConfigured: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null); const [status, setStatus] = useState("");
  const [marketKeys, setMarketKeys] = useState<Record<MarketProvider, string>>({ "twelve-data": "", eodhd: "" });
  const [marketConfigured, setMarketConfigured] = useState<Record<MarketProvider, boolean>>({ "twelve-data": twelveDataConfigured, eodhd: eodhdConfigured });
  const [marketStatus, setMarketStatus] = useState<Record<MarketProvider, { message: string; error: boolean } | null>>({ "twelve-data": null, eodhd: null });
  const [savingProvider, setSavingProvider] = useState<MarketProvider | null>(null);
  function setTheme(theme: string) { localStorage.setItem("theme", theme); const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches); document.documentElement.classList.toggle("dark", dark); setStatus(`外观已切换为${themeLabels[theme]}。`); }
  async function importJson(file?: File) { if (!file) return; const content = await file.text(); const response = await fetch("/api/trades/import", { method: "POST", headers: { "content-type": "application/json" }, body: content }); setStatus(response.ok ? "交易记录已导入。" : "导入失败，请检查 JSON 格式。"); }
  async function saveMarketData(provider: MarketProvider) {
    setSavingProvider(provider);
    setMarketStatus((current) => ({ ...current, [provider]: null }));
    try {
      const response = await fetch("/api/settings/market-data", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider, apiKey: marketKeys[provider] }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.message ?? "保存失败。");
      setMarketConfigured((current) => ({ ...current, [provider]: true }));
      setMarketKeys((current) => ({ ...current, [provider]: "" }));
      setMarketStatus((current) => ({ ...current, [provider]: { message: "API Key 已保存，现在可以到对应股票页面刷新 K 线。", error: false } }));
    } catch (cause) {
      setMarketStatus((current) => ({ ...current, [provider]: { message: cause instanceof Error ? cause.message : "保存失败。", error: true } }));
    } finally {
      setSavingProvider(null);
    }
  }
  return <div className="max-w-3xl divide-y divide-line rounded-[10px] border border-line bg-surface">
    <section className="grid gap-5 p-5 md:grid-cols-[170px_1fr]"><div><h2 className="font-semibold">外观</h2><p className="mt-1 text-xs text-muted">主题与涨跌颜色。</p></div><div className="space-y-4"><div><label className="label">主题</label><div className="flex gap-2">{["dark","light","system"].map((theme) => <Button key={theme} onClick={() => setTheme(theme)}>{themeLabels[theme]}</Button>)}</div></div><div><label className="label">涨跌颜色</label><select className="field"><option>国际惯例 · 绿涨红跌</option><option>中国惯例 · 红涨绿跌</option></select></div></div></section>
    <section className="grid gap-5 p-5 md:grid-cols-[170px_1fr]"><div><h2 className="font-semibold">行情 K 线</h2><p className="mt-1 text-xs text-muted">密钥仅保存在本机服务端，不会返回浏览器。</p></div><div className="grid gap-5"><p className="text-xs leading-5 text-muted">每只股票可在“股票配置”中独立选择行情来源。QQQ、NOK 使用 Twelve Data；港股可使用 EODHD。</p>{([
      { provider: "twelve-data" as const, label: "Twelve Data API Key", hint: "适用于 QQQ、NOK 等美股。" },
      { provider: "eodhd" as const, label: "EODHD API Key", hint: "适用于港股；小米集团行情代码为 1810.HK。免费计划每日 20 次，可取近一年日线。" },
    ]).map(({ provider, label, hint }) => <div key={provider} className="rounded-lg border border-line p-4"><div className="mb-3 flex items-center justify-between gap-3"><div><div className="text-sm font-semibold">{label}</div><div className="mt-1 text-[10px] text-muted">{hint}{provider === "eodhd" ? <> <a className="text-blue-400 hover:underline" href="https://eodhd.com/" target="_blank" rel="noreferrer">申请 API Key</a></> : null}</div></div><span className={marketConfigured[provider] ? "text-xs text-buy" : "text-xs text-yellow-500"}>{marketConfigured[provider] ? "已配置" : "未配置"}</span></div><label><span className="sr-only">{label}</span><div className="flex gap-2"><div className="relative min-w-0 flex-1"><KeyRound size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="field pl-9" type="password" autoComplete="off" value={marketKeys[provider]} onChange={(event) => setMarketKeys((current) => ({ ...current, [provider]: event.target.value }))} placeholder={marketConfigured[provider] ? "输入新密钥可覆盖现有配置" : "粘贴 API Key"} /></div><Button variant="primary" onClick={() => saveMarketData(provider)} disabled={!marketKeys[provider].trim() || savingProvider !== null}>{savingProvider === provider ? "正在保存…" : "保存配置"}</Button></div></label>{marketStatus[provider] ? <p className={marketStatus[provider]?.error ? "mt-3 text-xs text-sell" : "mt-3 text-xs text-buy"}>{marketStatus[provider]?.message}</p> : null}</div>)}</div></section>
    <section className="grid gap-5 p-5 md:grid-cols-[170px_1fr]"><div><h2 className="font-semibold">分析参数</h2><p className="mt-1 text-xs text-muted">可解释的默认分析参数。</p></div><div className="grid grid-cols-2 gap-3"><label><span className="label">左侧枢轴</span><input className="field" type="number" defaultValue="3" /></label><label><span className="label">右侧枢轴</span><input className="field" type="number" defaultValue="3" /></label><label className="col-span-2"><span className="label">区间窗口</span><input className="field" defaultValue="20, 60, 120, 250" /></label></div></section>
    <section className="grid gap-5 p-5 md:grid-cols-[170px_1fr]"><div><h2 className="font-semibold">数据</h2><p className="mt-1 text-xs text-muted">可迁移的本地交易日志。</p></div><div><div className="flex flex-wrap gap-2"><a href="/api/trades/export" download><Button><Download size={14} /> 导出交易 JSON</Button></a><Button onClick={() => fileRef.current?.click()}><Upload size={14} /> 导入交易 JSON</Button><input ref={fileRef} hidden type="file" accept="application/json" onChange={(event) => importJson(event.target.files?.[0])} /></div>{status ? <p className="mt-3 text-xs text-buy">{status}</p> : null}</div></section>
  </div>;
}
