export type TradeSide = "BUY" | "SELL";

export type Candle = {
  id?: number;
  instrumentId?: number;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source?: string;
  adjustment?: PriceAdjustment;
};

export type PriceAdjustment = "raw" | "splits";

export type ExitFeeModel = {
  ratePct: string;
  fixed: string;
  minimum: string;
};

export type Instrument = {
  id: number;
  symbol: string;
  name: string;
  exchange: string;
  market: string;
  currency: string;
  timezone: string;
  dataProvider: string;
  providerSymbol: string;
  priceAdjustment: PriceAdjustment;
  marketDataStale: boolean;
  lastMarketRefreshAt: string | null;
  exitFeeModel: ExitFeeModel;
};

export type Trade = {
  id: number;
  instrumentId: number;
  accountId: number;
  side: TradeSide;
  tradeAt: string;
  tradeDate: string;
  price: string;
  quantity: string;
  fee: string;
  estimatedExitFee: string;
  currency: string;
  strategyId: number | null;
  strategy?: string | null;
  reason: string;
  plan: string;
  note: string;
  plannedStop: string | null;
  plannedTarget: string | null;
  tags?: string[];
};

export type TradeContextSnapshot = {
  tradeId?: number;
  analysisVersion: string;
  price: number;
  range20High: number | null;
  range20Low: number | null;
  range20Percentile: number | null;
  range60High: number | null;
  range60Low: number | null;
  range60Percentile: number | null;
  range120High: number | null;
  range120Low: number | null;
  range120Percentile: number | null;
  range250High: number | null;
  range250Low: number | null;
  range250Percentile: number | null;
  ma5: number | null;
  ma10: number | null;
  ma20: number | null;
  ma60: number | null;
  ma120: number | null;
  ma250: number | null;
  distanceToMa20Pct: number | null;
  distanceToMa60Pct: number | null;
  atr14: number | null;
  atrPercent: number | null;
  volume: number | null;
  avgVolume20: number | null;
  volumeRatio20: number | null;
  nearestPriorPivotHigh: number | null;
  distanceToPivotHighPct: number | null;
  pivotHighDate: string | null;
  nearestPriorPivotLow: number | null;
  distanceToPivotLowPct: number | null;
  pivotLowDate: string | null;
  daysSince20High: number | null;
  daysSince20Low: number | null;
  createdAt?: string;
};

export type TradeOutcome = {
  tradeId?: number;
  return1d: number | null;
  return3d: number | null;
  return5d: number | null;
  return10d: number | null;
  return20d: number | null;
  return60d: number | null;
  mfe5d: number | null;
  mae5d: number | null;
  mfe20d: number | null;
  mae20d: number | null;
  maxHigh20d: number | null;
  minLow20d: number | null;
  sellMissedGain20d: number | null;
  calculatedThrough: string | null;
};

export type TradeWithAnalysis = Trade & {
  snapshot: TradeContextSnapshot | null;
  outcome: TradeOutcome | null;
};

export type StockWorkspaceData = {
  instrument: Instrument;
  candles: Candle[];
  trades: TradeWithAnalysis[];
  manualLevels: Array<{ id: number; price: number; type: string; label: string; note: string }>;
  updatedAt: string | null;
};
