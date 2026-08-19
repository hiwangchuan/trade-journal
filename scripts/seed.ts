import { sqlite } from "../src/db";

const trackedInstruments = [
  { symbol: "QQQ", name: "Invesco QQQ Trust", exchange: "NASDAQ", market: "US", currency: "USD", timezone: "America/New_York", dataProvider: "twelve-data", providerSymbol: "QQQ" },
  { symbol: "01810.HK", name: "小米集团-W", exchange: "HKEX", market: "HK", currency: "HKD", timezone: "Asia/Hong_Kong", dataProvider: "eodhd", providerSymbol: "1810.HK" },
  { symbol: "NOK", name: "Nokia Oyj ADR", exchange: "NYSE", market: "US", currency: "USD", timezone: "America/New_York", dataProvider: "twelve-data", providerSymbol: "NOK" },
] as const;

const strategyNames = ["Breakout", "Pullback", "Support", "Mean Reversion", "Trend", "Earnings", "Stop Loss", "Take Profit", "Manual"];
const upsertInstrument = sqlite.prepare("INSERT INTO instruments(symbol,name,exchange,market,currency,timezone,data_provider,provider_symbol) VALUES (@symbol,@name,@exchange,@market,@currency,@timezone,@dataProvider,@providerSymbol) ON CONFLICT(symbol) DO UPDATE SET name=excluded.name,exchange=excluded.exchange,market=excluded.market,currency=excluded.currency,timezone=excluded.timezone,data_provider=excluded.data_provider,provider_symbol=excluded.provider_symbol,updated_at=CURRENT_TIMESTAMP");

sqlite.transaction(() => {
  // The old seed was entirely synthetic. Cascades remove its candles, trades,
  // snapshots, outcomes, tag links, and manual levels without touching real rows.
  sqlite.prepare("DELETE FROM instruments WHERE data_provider='mock'").run();
  for (const name of strategyNames) sqlite.prepare("INSERT OR IGNORE INTO strategies(name) VALUES (?)").run(name);
  for (const instrument of trackedInstruments) upsertInstrument.run(instrument);
})();

console.log("Initialized QQQ, 01810.HK (小米集团-W), and NOK as real tracked instruments. No demo candles or trades were created.");
