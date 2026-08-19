import { listInstruments, listTrades } from "@/lib/data";
import { StockDirectory } from "@/components/stocks/stock-directory";

export const dynamic = "force-dynamic";
export default function StocksPage() {
  const instruments = listInstruments(); const trades = listTrades();
  const tradeCounts = Object.fromEntries(instruments.map((instrument) => [instrument.id, trades.filter((trade) => trade.instrumentId === instrument.id).length]));
  return <div className="page-wrap"><StockDirectory instruments={instruments} tradeCounts={tradeCounts} /></div>;
}
