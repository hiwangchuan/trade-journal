import { notFound } from "next/navigation";
import { after } from "next/server";
import { StockWorkspace } from "@/components/stock-workspace";
import { getWorkspace } from "@/lib/data";
import { autoSyncInstrumentIfDue } from "@/lib/market-data/sync";

export const dynamic = "force-dynamic";
export default async function StockDetailPage({ params }: { params: Promise<{ symbol: string }> }) { const { symbol } = await params; const data = getWorkspace(decodeURIComponent(symbol)); if (!data) notFound(); after(async () => { await autoSyncInstrumentIfDue(data.instrument.id).catch(() => null); }); return <StockWorkspace data={data} twelveDataConfigured={Boolean(process.env.TWELVE_DATA_API_KEY)} eodhdConfigured={Boolean(process.env.EODHD_API_KEY)} />; }
