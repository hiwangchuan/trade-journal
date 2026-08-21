import { createHash } from "node:crypto";
import { sqlite } from "@/db";
import {
  attachForecastDates,
  buildMonthlyBuyCohorts,
  calculateActualCurve,
  calculateCalibration,
  calculateForecastSnapshot,
  DCA_ALGORITHM_VERSION,
  type ForecastSnapshot,
  type MonthlyBuyCohort,
} from "@/lib/dca/analysis";
import type { DcaAnalysisData, DcaConfidence, DcaForecastPoint, StockWorkspaceData, Trade } from "@/types";

type RunRow = {
  id: number;
  sampleCount: number;
  confidence: DcaConfidence;
  dataCutoffDate: string | null;
  features: string | null;
};

type PointRow = { horizon: number; p20: number; p50: number; p80: number; baselineP50: number };

export function ensureDcaForecastTables() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS dca_forecast_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      instrument_id INTEGER NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
      account_id INTEGER NOT NULL,
      cohort_month TEXT NOT NULL,
      anchor_date TEXT NOT NULL,
      source_trade_ids TEXT NOT NULL,
      algorithm_version TEXT NOT NULL,
      input_hash TEXT NOT NULL,
      series_id INTEGER REFERENCES market_data_series(id) ON DELETE SET NULL,
      adjustment TEXT NOT NULL,
      data_cutoff_date TEXT,
      quantity TEXT NOT NULL,
      average_entry_price TEXT NOT NULL,
      invested_amount TEXT NOT NULL,
      buy_fees TEXT NOT NULL,
      exit_fee_model TEXT NOT NULL,
      features TEXT,
      sample_count INTEGER NOT NULL DEFAULT 0,
      confidence TEXT NOT NULL DEFAULT 'insufficient',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS dca_forecast_runs_cohort ON dca_forecast_runs(instrument_id,account_id,cohort_month,created_at);
    CREATE INDEX IF NOT EXISTS dca_forecast_runs_input ON dca_forecast_runs(input_hash,algorithm_version);
    CREATE TABLE IF NOT EXISTS dca_forecast_points (
      run_id INTEGER NOT NULL REFERENCES dca_forecast_runs(id) ON DELETE CASCADE,
      horizon INTEGER NOT NULL,
      p20 REAL NOT NULL,
      p50 REAL NOT NULL,
      p80 REAL NOT NULL,
      baseline_p50 REAL NOT NULL,
      PRIMARY KEY(run_id,horizon)
    );
  `);
}

function cohortInputHash(workspace: StockWorkspaceData, cohort: MonthlyBuyCohort) {
  const historicalCandles = workspace.candles.filter((candle) => candle.time < cohort.anchorDate).map((candle) => [candle.time, candle.open, candle.high, candle.low, candle.close, candle.volume]);
  return createHash("sha256").update(JSON.stringify({
    algorithm: DCA_ALGORITHM_VERSION,
    instrumentId: workspace.instrument.id,
    seriesId: workspace.marketData?.id ?? null,
    adjustment: workspace.marketData?.adjustment ?? workspace.instrument.priceAdjustment,
    cohort: {
      accountId: cohort.accountId,
      month: cohort.month,
      anchorDate: cohort.anchorDate,
      buyTradeIds: cohort.buyTradeIds,
      quantity: cohort.quantity.toString(),
      principal: cohort.principal.toString(),
      buyFees: cohort.buyFees.toString(),
      fallbackExitFee: cohort.fallbackExitFee.toString(),
    },
    exitFeeModel: workspace.instrument.exitFeeModel,
    historicalCandles,
  })).digest("hex");
}

function insertSnapshot(workspace: StockWorkspaceData, cohort: MonthlyBuyCohort, inputHash: string, snapshot: ForecastSnapshot) {
  return sqlite.transaction(() => {
    const result = sqlite.prepare(`
      INSERT INTO dca_forecast_runs(
        instrument_id,account_id,cohort_month,anchor_date,source_trade_ids,algorithm_version,input_hash,
        series_id,adjustment,data_cutoff_date,quantity,average_entry_price,invested_amount,buy_fees,
        exit_fee_model,features,sample_count,confidence
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      workspace.instrument.id,
      cohort.accountId,
      cohort.month,
      cohort.anchorDate,
      JSON.stringify(cohort.buyTradeIds),
      DCA_ALGORITHM_VERSION,
      inputHash,
      workspace.marketData?.id ?? null,
      workspace.marketData?.adjustment ?? workspace.instrument.priceAdjustment,
      snapshot.dataCutoffDate,
      cohort.quantity.toString(),
      cohort.averageEntryPrice.toDecimalPlaces(6).toString(),
      cohort.investedAmount.toDecimalPlaces(2).toFixed(2),
      cohort.buyFees.toDecimalPlaces(2).toFixed(2),
      JSON.stringify(workspace.instrument.exitFeeModel),
      snapshot.featureVector ? JSON.stringify(snapshot.featureVector) : null,
      snapshot.sampleCount,
      snapshot.confidence,
    );
    const runId = Number(result.lastInsertRowid);
    const insertPoint = sqlite.prepare("INSERT INTO dca_forecast_points(run_id,horizon,p20,p50,p80,baseline_p50) VALUES (?,?,?,?,?,?)");
    for (const point of snapshot.points) insertPoint.run(runId, point.horizon, point.p20, point.p50, point.p80, point.baselineP50);
    return runId;
  })();
}

function loadPoints(runId: number) {
  return sqlite.prepare("SELECT horizon,p20,p50,p80,baseline_p50 AS baselineP50 FROM dca_forecast_points WHERE run_id=? ORDER BY horizon").all(runId) as PointRow[];
}

function loadOrCreateSnapshot(workspace: StockWorkspaceData, cohort: MonthlyBuyCohort, force: boolean) {
  const inputHash = cohortInputHash(workspace, cohort);
  let run = !force ? sqlite.prepare(`
    SELECT id,sample_count AS sampleCount,confidence,data_cutoff_date AS dataCutoffDate,features
    FROM dca_forecast_runs WHERE input_hash=? AND algorithm_version=? ORDER BY id DESC LIMIT 1
  `).get(inputHash, DCA_ALGORITHM_VERSION) as RunRow | undefined : undefined;
  if (!run) {
    const snapshot = calculateForecastSnapshot(workspace.candles, cohort, workspace.instrument.exitFeeModel);
    const id = insertSnapshot(workspace, cohort, inputHash, snapshot);
    run = { id, sampleCount: snapshot.sampleCount, confidence: snapshot.confidence, dataCutoffDate: snapshot.dataCutoffDate, features: snapshot.featureVector ? JSON.stringify(snapshot.featureVector) : null };
  }
  return { run, points: loadPoints(run.id) };
}

export function getDcaAnalysis(workspace: StockWorkspaceData, options: { force?: boolean } = {}): DcaAnalysisData {
  ensureDcaForecastTables();
  const trades = workspace.trades as Trade[];
  const cohorts = buildMonthlyBuyCohorts(trades).map((cohort) => {
    const { run, points } = loadOrCreateSnapshot(workspace, cohort, options.force ?? false);
    const forecastPoints = attachForecastDates(points as Array<Omit<DcaForecastPoint, "date">>, workspace.candles, cohort.anchorDate);
    const actualPoints = calculateActualCurve(workspace.candles, trades, cohort, workspace.instrument.exitFeeModel);
    const calibration = calculateCalibration(forecastPoints, actualPoints);
    const current = actualPoints.at(-1);
    return {
      id: `${cohort.accountId}:${cohort.month}:${run.id}`,
      runId: run.id,
      accountId: cohort.accountId,
      month: cohort.month,
      anchorDate: cohort.anchorDate,
      buyTradeIds: cohort.buyTradeIds,
      quantity: cohort.quantity.toDecimalPlaces(6).toString(),
      averageEntryPrice: cohort.averageEntryPrice.toDecimalPlaces(4).toFixed(4),
      investedAmount: cohort.investedAmount.toDecimalPlaces(2).toFixed(2),
      buyFees: cohort.buyFees.toDecimalPlaces(2).toFixed(2),
      sampleCount: run.sampleCount,
      confidence: run.confidence,
      dataCutoffDate: run.dataCutoffDate,
      algorithmVersion: DCA_ALGORITHM_VERSION,
      forecastPoints,
      actualPoints,
      calibration,
      currentReturnPct: current?.returnPct ?? null,
      closed: current?.remainingQuantity === "0",
    };
  });
  const calibration = cohorts.flatMap((cohort) => cohort.calibration);
  const intervalHits = calibration.filter((point) => point.withinRange).length;
  const meanAbsoluteError = calibration.length ? calibration.reduce((total, point) => total + Math.abs(point.errorPct), 0) / calibration.length : null;
  return {
    generatedAt: new Date().toISOString(),
    algorithmVersion: DCA_ALGORITHM_VERSION,
    methodology: "仅使用买入日前数据匹配历史相似状态，输出含买入费与预计卖出费的P20/P50/P80收益区间；不连接券商，不产生或执行订单。",
    cohorts,
    metrics: {
      cohortCount: cohorts.length,
      sufficientCount: cohorts.filter((cohort) => cohort.confidence !== "insufficient").length,
      calibrationCount: calibration.length,
      intervalCoveragePct: calibration.length ? Number((intervalHits / calibration.length * 100).toFixed(2)) : null,
      meanAbsoluteErrorPct: meanAbsoluteError === null ? null : Number(meanAbsoluteError.toFixed(4)),
    },
  };
}
