import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
};

export const instruments = sqliteTable("instruments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  symbol: text("symbol").notNull().unique(),
  name: text("name").notNull(),
  exchange: text("exchange").notNull().default(""),
  market: text("market").notNull().default(""),
  currency: text("currency").notNull().default("USD"),
  timezone: text("timezone").notNull().default("America/New_York"),
  dataProvider: text("data_provider").notNull().default("mock"),
  providerSymbol: text("provider_symbol").notNull(),
  priceAdjustment: text("price_adjustment", { enum: ["raw", "splits"] }).notNull().default("splits"),
  marketDataStale: integer("market_data_stale", { mode: "boolean" }).notNull().default(false),
  lastMarketRefreshAt: text("last_market_refresh_at"),
  exitFeeRatePct: text("exit_fee_rate_pct").notNull().default("0"),
  exitFeeFixed: text("exit_fee_fixed").notNull().default("0"),
  exitFeeMinimum: text("exit_fee_minimum").notNull().default("0"),
  ...timestamps,
});

export const marketDataSeries = sqliteTable("market_data_series", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  instrumentId: integer("instrument_id").notNull().references(() => instruments.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  providerSymbol: text("provider_symbol").notNull(),
  interval: text("interval").notNull().default("1day"),
  adjustment: text("adjustment", { enum: ["raw", "splits"] }).notNull().default("raw"),
  currency: text("currency").notNull().default("USD"),
  exchange: text("exchange").notNull().default(""),
  timezone: text("timezone").notNull().default("UTC"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  earliestDate: text("earliest_date"),
  latestDate: text("latest_date"),
  candleCount: integer("candle_count").notNull().default(0),
  dataRevision: integer("data_revision").notNull().default(0),
  lastAttemptAt: text("last_attempt_at"),
  lastSuccessAt: text("last_success_at"),
  status: text("status").notNull().default("EMPTY"),
  qualityMessage: text("quality_message").notNull().default(""),
  ...timestamps,
}, (table) => [
  uniqueIndex("market_data_series_identity").on(table.instrumentId, table.provider, table.providerSymbol, table.interval, table.adjustment),
  index("market_data_series_active").on(table.instrumentId, table.isActive),
]);

export const candles = sqliteTable("candles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  instrumentId: integer("instrument_id").notNull().references(() => instruments.id, { onDelete: "cascade" }),
  seriesId: integer("series_id").references(() => marketDataSeries.id, { onDelete: "cascade" }),
  interval: text("interval").notNull().default("1day"),
  timestamp: text("timestamp").notNull(),
  open: real("open").notNull(), high: real("high").notNull(), low: real("low").notNull(), close: real("close").notNull(),
  volume: real("volume").notNull(), source: text("source").notNull().default("mock"), adjustment: text("adjustment", { enum: ["raw", "splits"] }).notNull().default("raw"),
  ...timestamps,
}, (table) => [
  uniqueIndex("candles_series_timestamp").on(table.seriesId, table.timestamp),
  index("candles_instrument_timestamp").on(table.instrumentId, table.timestamp),
]);

export const marketSyncRuns = sqliteTable("market_sync_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  seriesId: integer("series_id").notNull().references(() => marketDataSeries.id, { onDelete: "cascade" }),
  mode: text("mode").notNull(),
  status: text("status").notNull().default("RUNNING"),
  requestedFrom: text("requested_from"),
  requestedTo: text("requested_to"),
  returnedCount: integer("returned_count").notNull().default(0),
  insertedCount: integer("inserted_count").notNull().default(0),
  updatedCount: integer("updated_count").notNull().default(0),
  unchangedCount: integer("unchanged_count").notNull().default(0),
  invalidCount: integer("invalid_count").notNull().default(0),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  startedAt: text("started_at").notNull().default("CURRENT_TIMESTAMP"),
  completedAt: text("completed_at"),
}, (table) => [index("market_sync_runs_series_started").on(table.seriesId, table.startedAt)]);

export const corporateActions = sqliteTable("corporate_actions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  instrumentId: integer("instrument_id").notNull().references(() => instruments.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  effectiveDate: text("effective_date").notNull(),
  ratio: real("ratio"),
  cashAmount: real("cash_amount"),
  currency: text("currency"),
  source: text("source").notNull(),
  status: text("status").notNull().default("DETECTED"),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
}, (table) => [uniqueIndex("corporate_actions_identity").on(table.instrumentId, table.type, table.effectiveDate, table.source)]);

export const strategies = sqliteTable("strategies", {
  id: integer("id").primaryKey({ autoIncrement: true }), name: text("name").notNull().unique(), description: text("description").notNull().default(""), createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const trades = sqliteTable("trades", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  instrumentId: integer("instrument_id").notNull().references(() => instruments.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().default(1), side: text("side", { enum: ["BUY", "SELL"] }).notNull(),
  tradeAt: text("trade_at").notNull(), tradeDate: text("trade_date").notNull(),
  price: text("price").notNull(), quantity: text("quantity").notNull(), fee: text("fee").notNull().default("0"), estimatedExitFee: text("estimated_exit_fee").notNull().default("0"), currency: text("currency").notNull(),
  strategyId: integer("strategy_id").references(() => strategies.id, { onDelete: "set null" }),
  reason: text("reason").notNull().default(""), plan: text("plan").notNull().default(""), note: text("note").notNull().default(""),
  plannedStop: text("planned_stop"), plannedTarget: text("planned_target"),
  ...timestamps,
}, (table) => [index("trades_instrument_date").on(table.instrumentId, table.tradeDate), index("trades_side").on(table.side)]);

export const tags = sqliteTable("tags", { id: integer("id").primaryKey({ autoIncrement: true }), name: text("name").notNull().unique(), createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP") });
export const tradeTags = sqliteTable("trade_tags", { tradeId: integer("trade_id").notNull().references(() => trades.id, { onDelete: "cascade" }), tagId: integer("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }) }, (table) => [uniqueIndex("trade_tags_unique").on(table.tradeId, table.tagId)]);

export const manualLevels = sqliteTable("manual_levels", {
  id: integer("id").primaryKey({ autoIncrement: true }), instrumentId: integer("instrument_id").notNull().references(() => instruments.id, { onDelete: "cascade" }),
  price: real("price").notNull(), type: text("type", { enum: ["SUPPORT", "RESISTANCE", "CUSTOM"] }).notNull(), label: text("label").notNull().default(""), startDate: text("start_date"), endDate: text("end_date"), note: text("note").notNull().default(""), createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const tradeAnalysisSnapshots = sqliteTable("trade_analysis_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }), tradeId: integer("trade_id").notNull().unique().references(() => trades.id, { onDelete: "cascade" }), analysisVersion: text("analysis_version").notNull(), price: real("price").notNull(),
  range20High: real("range_20_high"), range20Low: real("range_20_low"), range20Percentile: real("range_20_percentile"),
  range60High: real("range_60_high"), range60Low: real("range_60_low"), range60Percentile: real("range_60_percentile"),
  range120High: real("range_120_high"), range120Low: real("range_120_low"), range120Percentile: real("range_120_percentile"),
  range250High: real("range_250_high"), range250Low: real("range_250_low"), range250Percentile: real("range_250_percentile"),
  ma5: real("ma_5"), ma10: real("ma_10"), ma20: real("ma_20"), ma60: real("ma_60"), ma120: real("ma_120"), ma250: real("ma_250"),
  distanceToMa20Pct: real("distance_to_ma_20_pct"), distanceToMa60Pct: real("distance_to_ma_60_pct"), atr14: real("atr_14"), atrPercent: real("atr_percent"), volume: real("volume"), avgVolume20: real("avg_volume_20"), volumeRatio20: real("volume_ratio_20"),
  nearestPriorPivotHigh: real("nearest_prior_pivot_high"), distanceToPivotHighPct: real("distance_to_pivot_high_pct"), pivotHighDate: text("pivot_high_date"), nearestPriorPivotLow: real("nearest_prior_pivot_low"), distanceToPivotLowPct: real("distance_to_pivot_low_pct"), pivotLowDate: text("pivot_low_date"), daysSince20High: integer("days_since_20_high"), daysSince20Low: integer("days_since_20_low"), createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const tradeOutcomes = sqliteTable("trade_outcomes", {
  id: integer("id").primaryKey({ autoIncrement: true }), tradeId: integer("trade_id").notNull().unique().references(() => trades.id, { onDelete: "cascade" }),
  return1d: real("return_1d"), return3d: real("return_3d"), return5d: real("return_5d"), return10d: real("return_10d"), return20d: real("return_20d"), return60d: real("return_60d"),
  mfe5d: real("mfe_5d"), mae5d: real("mae_5d"), mfe20d: real("mfe_20d"), mae20d: real("mae_20d"), maxHigh20d: real("max_high_20d"), minLow20d: real("min_low_20d"), sellMissedGain20d: real("sell_missed_gain_20d"), buyValidationScore: real("buy_validation_score"), calculatedThrough: text("calculated_through"), updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
});
