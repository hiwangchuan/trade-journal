import { notFound } from "next/navigation";
import { StockWorkspace } from "@/components/stock-workspace";
import { getWorkspace } from "@/lib/data";

export const dynamic = "force-dynamic";
export default async function StockDetailPage({ params }: { params: Promise<{ symbol: string }> }) { const { symbol } = await params; const data = getWorkspace(decodeURIComponent(symbol)); if (!data) notFound(); return <StockWorkspace data={data} twelveDataConfigured={Boolean(process.env.TWELVE_DATA_API_KEY)} eodhdConfigured={Boolean(process.env.EODHD_API_KEY)} />; }
