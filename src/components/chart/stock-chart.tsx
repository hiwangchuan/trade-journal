"use client";
import { useEffect, useRef } from "react";
import { CandlestickSeries, ColorType, createChart, createSeriesMarkers, HistogramSeries, LineSeries, LineStyle, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { smaSeries } from "@/lib/analysis/moving-average";
import type { Candle, DcaCohortAnalysis, PriceLevelSegment, TradeWithAnalysis } from "@/types";

type Props = { candles: Candle[]; trades: TradeWithAnalysis[]; selectedId: number | null; showMa20: boolean; showMa60: boolean; showTrades: boolean; dcaCohort: DcaCohortAnalysis | null; levels: PriceLevelSegment[]; onSelect: (trade: TradeWithAnalysis) => void; onRecordAt: (date: string, price: number) => void };

export default function StockChart({ candles, trades, selectedId, showMa20, showMa60, showTrades, dcaCohort, levels, onSelect, onRecordAt }: Props) {
  const host = useRef<HTMLDivElement>(null); const tooltip = useRef<HTMLDivElement>(null); const chartRef = useRef<IChartApi | null>(null);
  useEffect(() => {
    if (!host.current || !candles.length) return;
    const isDark = document.documentElement.classList.contains("dark");
    const chart = createChart(host.current, { autoSize: true, layout: { background: { type: ColorType.Solid, color: isDark ? "#0e1012" : "#f5f6f7" }, textColor: isDark ? "#9097a1" : "#6a727d", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif", fontSize: 11 }, grid: { vertLines: { color: isDark ? "rgba(255,255,255,.045)" : "rgba(0,0,0,.055)" }, horzLines: { color: isDark ? "rgba(255,255,255,.045)" : "rgba(0,0,0,.055)" } }, rightPriceScale: { borderColor: isDark ? "#30353b" : "#dcdfe4", scaleMargins: { top: .08, bottom: .25 } }, leftPriceScale: { visible: Boolean(dcaCohort), borderColor: isDark ? "#30353b" : "#dcdfe4", scaleMargins: { top: .12, bottom: .28 } }, timeScale: { borderColor: isDark ? "#30353b" : "#dcdfe4", timeVisible: false, rightOffset: 5, barSpacing: 6, minBarSpacing: 2 }, crosshair: { vertLine: { color: "#78808a", labelBackgroundColor: "#333940" }, horzLine: { color: "#78808a", labelBackgroundColor: "#333940" } }, handleScale: { mouseWheel: true, pinch: true }, handleScroll: { mouseWheel: true, pressedMouseMove: true } });
    chartRef.current = chart;
    const candleSeries = chart.addSeries(CandlestickSeries, { upColor: "#34c17e", downColor: "#f45252", borderVisible: false, wickUpColor: "#34c17e", wickDownColor: "#f45252", priceLineVisible: false });
    candleSeries.setData(candles.map((c) => ({ time: c.time as `${number}-${number}-${number}`, open: c.open, high: c.high, low: c.low, close: c.close })));
    const volume = chart.addSeries(HistogramSeries, { priceScaleId: "volume", priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: .82, bottom: 0 } });
    volume.setData(candles.map((c) => ({ time: c.time as `${number}-${number}-${number}`, value: c.volume, color: c.close >= c.open ? "rgba(52,193,126,.55)" : "rgba(244,82,82,.52)" })));
    if (showMa20) { const series = chart.addSeries(LineSeries, { color: "#4d84e8", lineWidth: 1, priceLineVisible: false, lastValueVisible: false }); series.setData(smaSeries(candles, 20).map((p) => ({ ...p, time: p.time as `${number}-${number}-${number}` }))); }
    if (showMa60) { const series = chart.addSeries(LineSeries, { color: "#e8b438", lineWidth: 1, priceLineVisible: false, lastValueVisible: false }); series.setData(smaSeries(candles, 60).map((p) => ({ ...p, time: p.time as `${number}-${number}-${number}` }))); }
    const dcaSeries: Partial<Record<"p20" | "p50" | "p80" | "baseline" | "actual", ISeriesApi<"Line">>> = {};
    if (dcaCohort) {
      const returnFormat = { type: "custom" as const, formatter: (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(1)}%` };
      const forecastData = dcaCohort.forecastPoints.filter((point) => point.date);
      const addForecast = (key: "p20" | "p50" | "p80" | "baseline", color: string, lineWidth: 1 | 2, lineStyle: LineStyle) => {
        const series = chart.addSeries(LineSeries, { priceScaleId: "left", color, lineWidth, lineStyle, priceFormat: returnFormat, priceLineVisible: false, lastValueVisible: key === "p50", title: key === "p50" ? "历史情景P50" : "" });
        series.setData(forecastData.map((point) => ({ time: point.date! as `${number}-${number}-${number}`, value: point[key === "baseline" ? "baselineP50" : key] })));
        dcaSeries[key] = series;
      };
      addForecast("p20", "rgba(77,132,232,.48)", 1, LineStyle.Dashed);
      addForecast("p80", "rgba(77,132,232,.48)", 1, LineStyle.Dashed);
      addForecast("baseline", "rgba(159,166,178,.55)", 1, LineStyle.Dotted);
      addForecast("p50", "#4d84e8", 2, LineStyle.Solid);
      const actual = chart.addSeries(LineSeries, { priceScaleId: "left", color: "#34c17e", lineWidth: 2, priceFormat: returnFormat, priceLineVisible: false, lastValueVisible: true, title: "实际净收益" });
      actual.setData(dcaCohort.actualPoints.map((point) => ({ time: point.date as `${number}-${number}-${number}`, value: point.returnPct })));
      actual.createPriceLine({ price: 0, color: "rgba(232,180,56,.82)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "含费回本" });
      dcaSeries.actual = actual;
    }
    if (showTrades) {
      const grouped = new Map<string, TradeWithAnalysis[]>();
      for (const trade of trades) { const key = `${trade.tradeDate}:${trade.side}`; grouped.set(key, [...(grouped.get(key) ?? []), trade]); }
      createSeriesMarkers(candleSeries, [...grouped.values()].map((group) => { const trade = group[0]; return { time: trade.tradeDate as `${number}-${number}-${number}`, position: trade.side === "BUY" ? "belowBar" as const : "aboveBar" as const, color: trade.side === "BUY" ? "#34c17e" : "#f45252", shape: trade.side === "BUY" ? "arrowUp" as const : "arrowDown" as const, text: `${trade.side === "BUY" ? "B" : "S"}${group.length > 1 ? ` × ${group.length}` : ""}`, size: group.some((item) => item.id === selectedId) ? 1.3 : 1 }; }).sort((a,b) => String(a.time).localeCompare(String(b.time))));
    }
    for (const level of levels) {
      const points = candles.filter((candle) => candle.time >= level.startDate && (!level.endDate || candle.time < level.endDate));
      if (!points.length) continue;
      const color = level.type === "SUPPORT" ? "rgba(52,193,126,.78)" : level.type === "RESISTANCE" ? "rgba(244,82,82,.78)" : "rgba(167,139,250,.78)";
      const series = chart.addSeries(LineSeries, { color, lineWidth: 1, lineStyle: level.type === "CUSTOM" ? LineStyle.Dotted : LineStyle.Dashed, priceLineVisible: false, lastValueVisible: level.active, pointMarkersVisible: points.length === 1, pointMarkersRadius: 3, title: level.active ? level.label : "" });
      series.setData(points.map((candle) => ({ time: candle.time as `${number}-${number}-${number}`, value: level.price })));
    }
    chart.timeScale().fitContent();
    chart.subscribeClick((param) => { if (!param.time) return; const date = String(param.time); const sameDay = trades.filter((trade) => trade.tradeDate === date); if (sameDay.length) onSelect(sameDay[0]); });
    chart.subscribeCrosshairMove((param) => {
      const tip = tooltip.current; if (!tip || !param.time || !param.point) { if (tip) tip.style.opacity = "0"; return; }
      const data = param.seriesData.get(candleSeries) as { open?: number; high?: number; low?: number; close?: number } | undefined;
      if (!data?.close) return;
      const valueOf = (series?: ISeriesApi<"Line">) => {
        if (!series) return null;
        const point = param.seriesData.get(series) as { value?: number } | undefined;
        return typeof point?.value === "number" ? point.value : null;
      };
      const p20 = valueOf(dcaSeries.p20), p50 = valueOf(dcaSeries.p50), p80 = valueOf(dcaSeries.p80), actual = valueOf(dcaSeries.actual);
      const returns = dcaCohort && [p20, p50, p80, actual].some((value) => value !== null)
        ? `   情景 ${p20?.toFixed(1) ?? "—"}/${p50?.toFixed(1) ?? "—"}/${p80?.toFixed(1) ?? "—"}%   实际 ${actual?.toFixed(1) ?? "—"}%`
        : "";
      tip.textContent = `${String(param.time)}   O ${data.open?.toFixed(2)}   H ${data.high?.toFixed(2)}   L ${data.low?.toFixed(2)}   C ${data.close.toFixed(2)}${returns}`;
      tip.style.opacity = "1"; tip.style.transform = `translate(${Math.min(param.point.x + 14, Math.max(0, host.current!.clientWidth - 430))}px, ${Math.max(8, param.point.y - 32)}px)`;
    });
    const context = (event: MouseEvent) => { event.preventDefault(); const x = event.offsetX, y = event.offsetY; const time = chart.timeScale().coordinateToTime(x); const price = candleSeries.coordinateToPrice(y); if (time && price) onRecordAt(String(time), price); };
    host.current.addEventListener("contextmenu", context);
    return () => { host.current?.removeEventListener("contextmenu", context); chart.remove(); chartRef.current = null; };
  }, [candles, trades, selectedId, showMa20, showMa60, showTrades, dcaCohort, levels, onSelect, onRecordAt]);
  return <div className="relative h-full w-full"><div ref={host} className="h-full w-full" /><div ref={tooltip} className="pointer-events-none absolute left-0 top-0 z-10 max-w-[420px] rounded border border-line bg-surface/95 px-2 py-1 text-[10px] font-medium opacity-0 shadow-panel transition-opacity" /><div className="pointer-events-none absolute bottom-[20%] left-3 text-[10px] text-muted">成交量</div>{dcaCohort ? <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-x-3 gap-y-1 rounded border border-line bg-surface/90 px-2 py-1 text-[9px] shadow-sm"><span className="text-blue-400">● 历史P50</span><span className="text-blue-300/70">┄ P20/P80</span><span className="text-muted">┄ 全历史P50</span><span className="text-buy">● 实际净收益</span><span className="text-yellow-400">┄ 含费回本</span></div> : null}</div>;
}
