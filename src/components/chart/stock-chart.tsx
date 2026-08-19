"use client";
import { useEffect, useRef } from "react";
import { CandlestickSeries, ColorType, createChart, createSeriesMarkers, HistogramSeries, LineSeries, type IChartApi, type UTCTimestamp } from "lightweight-charts";
import { smaSeries } from "@/lib/analysis/moving-average";
import type { Candle, TradeWithAnalysis } from "@/types";

type Props = { candles: Candle[]; trades: TradeWithAnalysis[]; selectedId: number | null; showMa20: boolean; showMa60: boolean; showTrades: boolean; levels: Array<{ price: number; type: string; label: string }>; onSelect: (trade: TradeWithAnalysis) => void; onRecordAt: (date: string, price: number) => void };

export default function StockChart({ candles, trades, selectedId, showMa20, showMa60, showTrades, levels, onSelect, onRecordAt }: Props) {
  const host = useRef<HTMLDivElement>(null); const tooltip = useRef<HTMLDivElement>(null); const chartRef = useRef<IChartApi | null>(null);
  useEffect(() => {
    if (!host.current || !candles.length) return;
    const isDark = document.documentElement.classList.contains("dark");
    const chart = createChart(host.current, { autoSize: true, layout: { background: { type: ColorType.Solid, color: isDark ? "#0e1012" : "#f5f6f7" }, textColor: isDark ? "#9097a1" : "#6a727d", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif", fontSize: 11 }, grid: { vertLines: { color: isDark ? "rgba(255,255,255,.045)" : "rgba(0,0,0,.055)" }, horzLines: { color: isDark ? "rgba(255,255,255,.045)" : "rgba(0,0,0,.055)" } }, rightPriceScale: { borderColor: isDark ? "#30353b" : "#dcdfe4", scaleMargins: { top: .08, bottom: .25 } }, timeScale: { borderColor: isDark ? "#30353b" : "#dcdfe4", timeVisible: false, rightOffset: 5, barSpacing: 6, minBarSpacing: 2 }, crosshair: { vertLine: { color: "#78808a", labelBackgroundColor: "#333940" }, horzLine: { color: "#78808a", labelBackgroundColor: "#333940" } }, handleScale: { mouseWheel: true, pinch: true }, handleScroll: { mouseWheel: true, pressedMouseMove: true } });
    chartRef.current = chart;
    const candleSeries = chart.addSeries(CandlestickSeries, { upColor: "#34c17e", downColor: "#f45252", borderVisible: false, wickUpColor: "#34c17e", wickDownColor: "#f45252", priceLineVisible: false });
    candleSeries.setData(candles.map((c) => ({ time: c.time as `${number}-${number}-${number}`, open: c.open, high: c.high, low: c.low, close: c.close })));
    const volume = chart.addSeries(HistogramSeries, { priceScaleId: "volume", priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: .82, bottom: 0 } });
    volume.setData(candles.map((c) => ({ time: c.time as `${number}-${number}-${number}`, value: c.volume, color: c.close >= c.open ? "rgba(52,193,126,.55)" : "rgba(244,82,82,.52)" })));
    if (showMa20) { const series = chart.addSeries(LineSeries, { color: "#4d84e8", lineWidth: 1, priceLineVisible: false, lastValueVisible: false }); series.setData(smaSeries(candles, 20).map((p) => ({ ...p, time: p.time as `${number}-${number}-${number}` }))); }
    if (showMa60) { const series = chart.addSeries(LineSeries, { color: "#e8b438", lineWidth: 1, priceLineVisible: false, lastValueVisible: false }); series.setData(smaSeries(candles, 60).map((p) => ({ ...p, time: p.time as `${number}-${number}-${number}` }))); }
    if (showTrades) {
      const grouped = new Map<string, TradeWithAnalysis[]>();
      for (const trade of trades) { const key = `${trade.tradeDate}:${trade.side}`; grouped.set(key, [...(grouped.get(key) ?? []), trade]); }
      createSeriesMarkers(candleSeries, [...grouped.values()].map((group) => { const trade = group[0]; return { time: trade.tradeDate as `${number}-${number}-${number}`, position: trade.side === "BUY" ? "belowBar" as const : "aboveBar" as const, color: trade.side === "BUY" ? "#34c17e" : "#f45252", shape: trade.side === "BUY" ? "arrowUp" as const : "arrowDown" as const, text: `${trade.side === "BUY" ? "B" : "S"}${group.length > 1 ? ` × ${group.length}` : ""}`, size: group.some((item) => item.id === selectedId) ? 1.3 : 1 }; }).sort((a,b) => String(a.time).localeCompare(String(b.time))));
    }
    for (const level of levels) candleSeries.createPriceLine({ price: level.price, color: level.type === "SUPPORT" ? "rgba(52,193,126,.7)" : "rgba(244,82,82,.7)", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: level.label });
    chart.timeScale().fitContent();
    chart.subscribeClick((param) => { if (!param.time) return; const date = String(param.time); const sameDay = trades.filter((trade) => trade.tradeDate === date); if (sameDay.length) onSelect(sameDay[0]); });
    chart.subscribeCrosshairMove((param) => {
      const tip = tooltip.current; if (!tip || !param.time || !param.point) { if (tip) tip.style.opacity = "0"; return; }
      const data = param.seriesData.get(candleSeries) as { open?: number; high?: number; low?: number; close?: number } | undefined;
      if (!data?.close) return;
      tip.textContent = `${String(param.time)}   O ${data.open?.toFixed(2)}   H ${data.high?.toFixed(2)}   L ${data.low?.toFixed(2)}   C ${data.close.toFixed(2)}`;
      tip.style.opacity = "1"; tip.style.transform = `translate(${Math.min(param.point.x + 14, Math.max(0, host.current!.clientWidth - 290))}px, ${Math.max(8, param.point.y - 32)}px)`;
    });
    const context = (event: MouseEvent) => { event.preventDefault(); const x = event.offsetX, y = event.offsetY; const time = chart.timeScale().coordinateToTime(x); const price = candleSeries.coordinateToPrice(y); if (time && price) onRecordAt(String(time), price); };
    host.current.addEventListener("contextmenu", context);
    return () => { host.current?.removeEventListener("contextmenu", context); chart.remove(); chartRef.current = null; };
  }, [candles, trades, selectedId, showMa20, showMa60, showTrades, levels, onSelect, onRecordAt]);
  return <div className="relative h-full w-full"><div ref={host} className="h-full w-full" /><div ref={tooltip} className="pointer-events-none absolute left-0 top-0 z-10 rounded border border-line bg-surface/95 px-2 py-1 text-[10px] font-medium opacity-0 shadow-panel transition-opacity" /><div className="pointer-events-none absolute bottom-[20%] left-3 text-[10px] text-muted">成交量</div></div>;
}
