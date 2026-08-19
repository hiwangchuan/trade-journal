import Decimal from "decimal.js";
import type { ExitFeeModel } from "@/types";

export type BreakEvenResult = {
  investedAmount: string;
  roundTripFees: string;
  breakEvenPrice: string;
  requiredMovePct: string;
};

export function calculateBreakEven(params: { price: string; quantity: string; buyFee: string; estimatedSellFee: string }): BreakEvenResult | null {
  const price = new Decimal(params.price || 0);
  const quantity = new Decimal(params.quantity || 0);
  const buyFee = new Decimal(params.buyFee || 0);
  const estimatedSellFee = new Decimal(params.estimatedSellFee || 0);
  if (!price.isPositive() || !quantity.isPositive() || buyFee.isNegative() || estimatedSellFee.isNegative()) return null;
  const investedAmount = price.times(quantity).plus(buyFee);
  const roundTripFees = buyFee.plus(estimatedSellFee);
  const breakEvenPrice = investedAmount.plus(estimatedSellFee).div(quantity);
  const requiredMovePct = breakEvenPrice.div(price).minus(1).times(100);
  return { investedAmount: investedAmount.toFixed(2), roundTripFees: roundTripFees.toFixed(2), breakEvenPrice: breakEvenPrice.toDecimalPlaces(4, Decimal.ROUND_CEIL).toFixed(4), requiredMovePct: requiredMovePct.toFixed(4) };
}

export function hasExitFeeModel(model?: ExitFeeModel | null) {
  if (!model) return false;
  return new Decimal(model.ratePct || 0).gt(0) || new Decimal(model.fixed || 0).gt(0) || new Decimal(model.minimum || 0).gt(0);
}

export function estimateExitFee(grossProceeds: Decimal.Value, model?: ExitFeeModel | null, fallback: Decimal.Value = 0) {
  if (!hasExitFeeModel(model)) return new Decimal(fallback || 0);
  const gross = Decimal.max(0, new Decimal(grossProceeds || 0));
  const rate = new Decimal(model!.ratePct || 0).div(100);
  const minimum = new Decimal(model!.minimum || 0);
  const fixed = new Decimal(model!.fixed || 0);
  return Decimal.max(gross.times(rate), minimum).plus(fixed);
}

export function solveExitBreakEven(params: { requiredCash: Decimal.Value; quantity: Decimal.Value; model?: ExitFeeModel | null; fallbackFee?: Decimal.Value }) {
  const requiredCash = Decimal.max(0, new Decimal(params.requiredCash || 0));
  const quantity = new Decimal(params.quantity || 0);
  if (!quantity.gt(0)) return null;
  if (!hasExitFeeModel(params.model)) {
    const fee = new Decimal(params.fallbackFee || 0);
    const gross = requiredCash.plus(fee);
    return { gross, fee, price: gross.div(quantity) };
  }

  let lower = requiredCash;
  let upper = Decimal.max(1, requiredCash.times(1.25).plus(100));
  const net = (gross: Decimal) => gross.minus(estimateExitFee(gross, params.model));
  while (net(upper).lt(requiredCash)) upper = upper.times(2);
  for (let index = 0; index < 96; index += 1) {
    const middle = lower.plus(upper).div(2);
    if (net(middle).gte(requiredCash)) upper = middle;
    else lower = middle;
  }
  const fee = estimateExitFee(upper, params.model);
  return { gross: upper, fee, price: upper.div(quantity) };
}
