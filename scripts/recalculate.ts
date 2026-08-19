import { sqlite } from "../src/db";
import { recalculateTrade } from "../src/lib/trades/persistence";

const trades = sqlite.prepare("SELECT id FROM trades ORDER BY trade_at,id").all() as Array<{ id: number }>;
const recalculateAll = sqlite.transaction(() => {
  for (const trade of trades) recalculateTrade(trade.id);
});
recalculateAll();
console.log(`Recalculated ${trades.length} trades.`);
