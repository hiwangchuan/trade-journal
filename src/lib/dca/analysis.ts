import Decimal from "decimal.js";
import { atr } from "@/lib/analysis/atr";
import { sma } from "@/lib/analysis/moving-average";
import { rollingRange } from "@/lib/analysis/rolling-range";
import { pairTradesFifo } from "@/lib/analysis/trade-pairing";
import { volumeContext } from "@/lib/analysis/volume";
import { estimateExitFee } from "@/lib/trades/fees";
import type {
  Candle,
  DcaActualPoint,
  DcaCalibrationPoint,
  DcaConfidence,
  DcaForecastPoint,
  ExitFeeModel,
  Trade,
} from "@/types";

export const DCA_ALGORITHM_VERSION = "1.0.0";
export const DCA_MAX_HORIZON = 60;
const MIN_HISTORY = 250;
const MIN_SAMPLES = 20;
const MAX_SIMILAR_SAMPLES = 120;
const SAMPLE_GAP = 5;

export type MonthlyBuyCohort = {
  key: string;
  accountId: number;
  month: string;
  anchorDate: string;
  buyTradeIds: number[];
  quantity: Decimal;
  principal: Decimal;
  buyFees: Decimal;
  investedAmount: Decimal;
  averageEntryPrice: Decimal;
  fallbackExitFee: Decimal;
};

export type ForecastSnapshot = {
  sampleCount: number;
  confidence: DcaConfidence;
  dataCutoffDate: string | null;
  featureVector: Record<string, number> | null;
  points: Array<Omit<DcaForecastPoint, "date">>;
};

type RegimeFeature = {
  distanceMa20: number;
  distanceMa60: number;
  range20: number;
  range60: number;
  range120: number;
  range250: number;
  atrPct: number;
  volumeRatio: number;
  return20: number;
  return60: number;
};

const round = (value: number, places = 4) => Number(value.toFixed(places));

export function buildMonthlyBuyCohorts(trades: Trade[]): MonthlyBuyCohort[] {
  const groups = new Map<string, Trade[]>();
  for (const trade of trades) {
    if (trade.side !== "BUY") continue;
    const month = trade.tradeDate.slice(0, 7);
    const key = `${trade.accountId}:${month}`;
    groups.set(key, [...(groups.get(key) ?? []), trade]);
  }

  return [...groups.entries()].map(([key, items]) => {
    const ordered = [...items].sort((left, right) => left.tradeAt.localeCompare(right.tradeAt) || left.id - right.id);
    const quantity = ordered.reduce((total, trade) => total.plus(trade.quantity), new Decimal(0));
    const principal = ordered.reduce((total, trade) => total.plus(new Decimal(trade.price).times(trade.quantity)), new Decimal(0));
    const buyFees = ordered.reduce((total, trade) => total.plus(trade.fee), new Decimal(0));
    const fallbackExitFee = ordered.reduce((total, trade) => total.plus(trade.estimatedExitFee), new Decimal(0));
    return {
      key,
      accountId: ordered[0].accountId,
      month: ordered[0].tradeDate.slice(0, 7),
      anchorDate: ordered.at(-1)!.tradeDate,
      buyTradeIds: ordered.map((trade) => trade.id),
      quantity,
      principal,
      buyFees,
      investedAmount: principal.plus(buyFees),
      averageEntryPrice: quantity.gt(0) ? principal.div(quantity) : new Decimal(0),
      fallbackExitFee,
    };
  }).sort((left, right) => right.anchorDate.localeCompare(left.anchorDate) || right.accountId - left.accountId);
}

function featureAt(candles: Candle[], index: number, entryPrice: number): RegimeFeature | null {
  const history = candles.slice(0, index);
  if (history.length < MIN_HISTORY || !Number.isFinite(entryPrice) || entryPrice <= 0) return null;
  const ma20 = sma(history, 20);
  const ma60 = sma(history, 60);
  const range20 = rollingRange(history, entryPrice, 20);
  const range60 = rollingRange(history, entryPrice, 60);
  const range120 = rollingRange(history, entryPrice, 120);
  const range250 = rollingRange(history, entryPrice, 250);
  const atr14 = atr(history, 14);
  const volume = volumeContext(history, 20);
  const lastClose = history.at(-1)?.close;
  const close20 = history.at(-21)?.close;
  const close60 = history.at(-61)?.close;
  if (!ma20 || !ma60 || !range20 || !range60 || !range120 || !range250 || !atr14 || !volume.ratio || !lastClose || !close20 || !close60) return null;
  return {
    distanceMa20: (entryPrice / ma20 - 1) * 100,
    distanceMa60: (entryPrice / ma60 - 1) * 100,
    range20: range20.percentile,
    range60: range60.percentile,
    range120: range120.percentile,
    range250: range250.percentile,
    atrPct: atr14 / entryPrice * 100,
    volumeRatio: volume.ratio,
    return20: (lastClose / close20 - 1) * 100,
    return60: (lastClose / close60 - 1) * 100,
  };
}

function featureDistance(left: RegimeFeature, right: RegimeFeature) {
  const normalized = [
    (left.distanceMa20 - right.distanceMa20) / 10,
    (left.distanceMa60 - right.distanceMa60) / 20,
    (left.range20 - right.range20) / 0.5,
    (left.range60 - right.range60) / 0.5,
    (left.range120 - right.range120) / 0.5,
    (left.range250 - right.range250) / 0.5,
    (left.atrPct - right.atrPct) / 5,
    (left.volumeRatio - right.volumeRatio) / 1.5,
    (left.return20 - right.return20) / 20,
    (left.return60 - right.return60) / 40,
  ];
  return Math.sqrt(normalized.reduce((total, value) => total + value * value, 0));
}

function quantile(values: number[], probability: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function confidenceFor(sampleCount: number): DcaConfidence {
  if (sampleCount < MIN_SAMPLES) return "insufficient";
  if (sampleCount < 50) return "low";
  if (sampleCount < 100) return "medium";
  return "high";
}

function simulatedNetReturn(
  entryPrice: number,
  exitPrice: number,
  cohort: MonthlyBuyCohort,
  exitFeeModel: ExitFeeModel,
) {
  const simulatedPrincipal = cohort.quantity.times(entryPrice);
  const invested = simulatedPrincipal.plus(cohort.buyFees);
  if (!invested.gt(0)) return 0;
  const grossExit = cohort.quantity.times(exitPrice);
  const exitFee = estimateExitFee(grossExit, exitFeeModel, cohort.fallbackExitFee);
  return grossExit.minus(exitFee).minus(invested).div(invested).times(100).toNumber();
}

export function calculateForecastSnapshot(candles: Candle[], cohort: MonthlyBuyCohort, exitFeeModel: ExitFeeModel): ForecastSnapshot {
  const anchorIndexRaw = candles.findIndex((candle) => candle.time >= cohort.anchorDate);
  const anchorIndex = anchorIndexRaw >= 0 ? anchorIndexRaw : candles.length;
  const target = featureAt(candles, anchorIndex, cohort.averageEntryPrice.toNumber());
  const dataCutoffDate = candles.slice(0, anchorIndex).at(-1)?.time ?? null;
  if (!target) return { sampleCount: 0, confidence: "insufficient", dataCutoffDate, featureVector: null, points: [] };

  const candidates: Array<{ index: number; feature: RegimeFeature; distance: number }> = [];
  for (let index = MIN_HISTORY; index + DCA_MAX_HORIZON < anchorIndex; index += 1) {
    const feature = featureAt(candles, index, candles[index].close);
    if (feature) candidates.push({ index, feature, distance: featureDistance(target, feature) });
  }

  const selected: typeof candidates = [];
  for (const candidate of [...candidates].sort((left, right) => left.distance - right.distance)) {
    if (selected.some((item) => Math.abs(item.index - candidate.index) < SAMPLE_GAP)) continue;
    selected.push(candidate);
    if (selected.length >= MAX_SIMILAR_SAMPLES) break;
  }
  const baseline = candidates.filter((candidate) => candidate.index % SAMPLE_GAP === 0);
  const confidence = confidenceFor(selected.length);
  if (confidence === "insufficient") return { sampleCount: selected.length, confidence, dataCutoffDate, featureVector: target, points: [] };

  const points = Array.from({ length: DCA_MAX_HORIZON + 1 }, (_, horizon) => {
    const similarReturns = selected.map(({ index }) => simulatedNetReturn(candles[index].close, candles[index + horizon].close, cohort, exitFeeModel));
    const baselineReturns = baseline.map(({ index }) => simulatedNetReturn(candles[index].close, candles[index + horizon].close, cohort, exitFeeModel));
    return {
      horizon,
      p20: round(quantile(similarReturns, 0.2)),
      p50: round(quantile(similarReturns, 0.5)),
      p80: round(quantile(similarReturns, 0.8)),
      baselineP50: round(quantile(baselineReturns, 0.5)),
    };
  });

  return { sampleCount: selected.length, confidence, dataCutoffDate, featureVector: target, points };
}

export function calculateActualCurve(candles: Candle[], trades: Trade[], cohort: MonthlyBuyCohort, exitFeeModel: ExitFeeModel): DcaActualPoint[] {
  if (!cohort.investedAmount.gt(0)) return [];
  const pairs = pairTradesFifo(trades).filter((pair) => cohort.buyTradeIds.includes(pair.buyTradeId));
  const tradeById = new Map(trades.map((trade) => [trade.id, trade]));
  const futureCandles = candles.filter((candle) => candle.time >= cohort.anchorDate);
  const points: DcaActualPoint[] = [];

  for (let horizon = 0; horizon < futureCandles.length; horizon += 1) {
    const candle = futureCandles[horizon];
    const settled = pairs.filter((pair) => {
      const sell = tradeById.get(pair.sellTradeId);
      return sell ? sell.tradeDate <= candle.time : false;
    });
    const soldQuantity = settled.reduce((total, pair) => total.plus(pair.quantity), new Decimal(0));
    const realizedNetCash = settled.reduce((total, pair) => {
      const sell = tradeById.get(pair.sellTradeId)!;
      return total.plus(new Decimal(sell.price).times(pair.quantity).minus(pair.allocatedSellFee));
    }, new Decimal(0));
    const remainingQuantity = Decimal.max(0, cohort.quantity.minus(soldQuantity));
    const grossRemaining = remainingQuantity.times(candle.close);
    const fallbackFee = cohort.quantity.gt(0) ? cohort.fallbackExitFee.times(remainingQuantity).div(cohort.quantity) : new Decimal(0);
    const exitFee = remainingQuantity.gt(0) ? estimateExitFee(grossRemaining, exitFeeModel, fallbackFee) : new Decimal(0);
    const liquidationValue = realizedNetCash.plus(grossRemaining).minus(exitFee);
    const returnPct = liquidationValue.minus(cohort.investedAmount).div(cohort.investedAmount).times(100);
    points.push({
      horizon,
      date: candle.time,
      returnPct: round(returnPct.toNumber()),
      remainingQuantity: remainingQuantity.toDecimalPlaces(6).toString(),
      realizedNetCash: realizedNetCash.toDecimalPlaces(2).toFixed(2),
      estimatedExitFee: exitFee.toDecimalPlaces(2).toFixed(2),
    });
    if (remainingQuantity.eq(0)) break;
  }
  return points;
}

export function attachForecastDates(points: Array<Omit<DcaForecastPoint, "date">>, candles: Candle[], anchorDate: string): DcaForecastPoint[] {
  const futureCandles = candles.filter((candle) => candle.time >= anchorDate);
  return points.map((point) => ({ ...point, date: futureCandles[point.horizon]?.time ?? null }));
}

export function calculateCalibration(forecast: DcaForecastPoint[], actual: DcaActualPoint[]): DcaCalibrationPoint[] {
  const actualByHorizon = new Map(actual.map((point) => [point.horizon, point]));
  return [5, 20, 60].flatMap((horizon) => {
    const predicted = forecast.find((point) => point.horizon === horizon);
    const observed = actualByHorizon.get(horizon);
    if (!predicted || !observed) return [];
    return [{
      horizon,
      actualReturnPct: observed.returnPct,
      predictedMedianPct: predicted.p50,
      errorPct: round(observed.returnPct - predicted.p50),
      withinRange: observed.returnPct >= predicted.p20 && observed.returnPct <= predicted.p80,
    }];
  });
}
