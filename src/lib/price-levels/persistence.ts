import { sqlite } from "@/db";
import { getCandlesForActiveSeries } from "@/lib/market-data/storage";
import type { PriceLevel, PriceLevelAction, PriceLevelSegment, PriceLevelType, PriceLevelVersion } from "@/types";
import { analyzePriceLevel } from "./analysis";

type LevelRow = { id: number; instrumentId: number; price: number; type: PriceLevelType; label: string; note: string; startDate: string | null; endDate: string | null; createdAt: string };
type VersionRow = { id: number; manualLevelId: number; revision: number; action: PriceLevelAction; price: number; type: PriceLevelType; label: string; note: string; effectiveDate: string; recordedAt: string };
export type PriceLevelInput = { price: number; type: PriceLevelType; label: string; note: string };

export function ensurePriceLevelSchema() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS manual_level_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      manual_level_id INTEGER NOT NULL REFERENCES manual_levels(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('CREATED','UPDATED','ARCHIVED','RESTORED')),
      price REAL NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('SUPPORT','RESISTANCE','CUSTOM')),
      label TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      effective_date TEXT NOT NULL,
      recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(manual_level_id, revision)
    );
    CREATE INDEX IF NOT EXISTS manual_level_versions_level_revision ON manual_level_versions(manual_level_id, revision);
    INSERT OR IGNORE INTO manual_level_versions(manual_level_id,revision,action,price,type,label,note,effective_date,recorded_at)
      SELECT id,1,'CREATED',price,type,label,note,COALESCE(start_date,substr(created_at,1,10)),created_at FROM manual_levels;
  `);
}

function effectiveDate(instrumentId: number) {
  return getCandlesForActiveSeries(instrumentId).at(-1)?.time ?? new Date().toISOString().slice(0, 10);
}

function insertVersion(manualLevelId: number, revision: number, action: PriceLevelAction, value: PriceLevelInput, date: string) {
  sqlite.prepare(`INSERT INTO manual_level_versions(manual_level_id,revision,action,price,type,label,note,effective_date)
    VALUES (?,?,?,?,?,?,?,?)`).run(manualLevelId, revision, action, value.price, value.type, value.label, value.note, date);
}

function buildSegments(levelId: number, active: boolean, versions: PriceLevelVersion[]): PriceLevelSegment[] {
  const segments: PriceLevelSegment[] = [];
  for (let index = 0; index < versions.length; index += 1) {
    const version = versions[index];
    if (version.action === "ARCHIVED") continue;
    const next = versions[index + 1];
    const endDate = next?.effectiveDate ?? null;
    if (endDate === version.effectiveDate && next) continue;
    segments.push({
      key: `${levelId}:${version.revision}`,
      price: version.price,
      type: version.type,
      label: version.label,
      startDate: version.effectiveDate,
      endDate,
      active: active && !next,
    });
  }
  return segments;
}

export function listPriceLevels(instrumentId: number): PriceLevel[] {
  ensurePriceLevelSchema();
  const candles = getCandlesForActiveSeries(instrumentId);
  const rows = sqlite.prepare(`SELECT id,instrument_id AS instrumentId,price,type,label,note,start_date AS startDate,
    end_date AS endDate,created_at AS createdAt FROM manual_levels WHERE instrument_id=? ORDER BY end_date IS NULL DESC,id DESC`).all(instrumentId) as LevelRow[];
  if (!rows.length) return [];
  const versions = sqlite.prepare(`SELECT v.id,v.manual_level_id AS manualLevelId,v.revision,v.action,v.price,v.type,v.label,v.note,
    v.effective_date AS effectiveDate,v.recorded_at AS recordedAt FROM manual_level_versions v
    JOIN manual_levels l ON l.id=v.manual_level_id WHERE l.instrument_id=? ORDER BY v.manual_level_id,v.revision`).all(instrumentId) as VersionRow[];
  const grouped = new Map<number, PriceLevelVersion[]>();
  for (const version of versions) grouped.set(version.manualLevelId, [...(grouped.get(version.manualLevelId) ?? []), version]);
  return rows.map((row) => {
    const history = grouped.get(row.id) ?? [];
    const active = row.endDate === null;
    const startDate = row.startDate ?? row.createdAt.slice(0, 10);
    return {
      ...row,
      startDate,
      active,
      revision: history.at(-1)?.revision ?? 1,
      versions: history,
      segments: buildSegments(row.id, active, history),
      stats: analyzePriceLevel(candles, { price: row.price, type: row.type, startDate, endDate: row.endDate }),
    };
  });
}

export function createPriceLevel(instrumentId: number, value: PriceLevelInput) {
  ensurePriceLevelSchema();
  const instrument = sqlite.prepare("SELECT id FROM instruments WHERE id=?").get(instrumentId);
  if (!instrument) return null;
  const date = effectiveDate(instrumentId);
  const id = sqlite.transaction(() => {
    const result = sqlite.prepare("INSERT INTO manual_levels(instrument_id,price,type,label,start_date,note) VALUES (?,?,?,?,?,?)")
      .run(instrumentId, value.price, value.type, value.label, date, value.note);
    const manualLevelId = Number(result.lastInsertRowid);
    insertVersion(manualLevelId, 1, "CREATED", value, date);
    return manualLevelId;
  })();
  return listPriceLevels(instrumentId).find((level) => level.id === id) ?? null;
}

function findLevel(id: number) {
  return sqlite.prepare(`SELECT id,instrument_id AS instrumentId,price,type,label,note,start_date AS startDate,end_date AS endDate
    FROM manual_levels WHERE id=?`).get(id) as (Omit<LevelRow, "createdAt">) | undefined;
}

function nextRevision(id: number) {
  return Number((sqlite.prepare("SELECT COALESCE(MAX(revision),0)+1 AS revision FROM manual_level_versions WHERE manual_level_id=?").get(id) as { revision: number }).revision);
}

export function updatePriceLevel(id: number, value: PriceLevelInput) {
  ensurePriceLevelSchema();
  const existing = findLevel(id);
  if (!existing || existing.endDate) return null;
  const date = effectiveDate(existing.instrumentId);
  sqlite.transaction(() => {
    sqlite.prepare("UPDATE manual_levels SET price=?,type=?,label=?,note=?,start_date=? WHERE id=?")
      .run(value.price, value.type, value.label, value.note, date, id);
    insertVersion(id, nextRevision(id), "UPDATED", value, date);
  })();
  return listPriceLevels(existing.instrumentId).find((level) => level.id === id) ?? null;
}

export function archivePriceLevel(id: number) {
  ensurePriceLevelSchema();
  const existing = findLevel(id);
  if (!existing || existing.endDate) return null;
  const date = effectiveDate(existing.instrumentId);
  const value = { price: existing.price, type: existing.type, label: existing.label, note: existing.note };
  sqlite.transaction(() => {
    sqlite.prepare("UPDATE manual_levels SET end_date=? WHERE id=?").run(date, id);
    insertVersion(id, nextRevision(id), "ARCHIVED", value, date);
  })();
  return listPriceLevels(existing.instrumentId).find((level) => level.id === id) ?? null;
}

export function restorePriceLevel(id: number) {
  ensurePriceLevelSchema();
  const existing = findLevel(id);
  if (!existing || !existing.endDate) return null;
  const date = effectiveDate(existing.instrumentId);
  const value = { price: existing.price, type: existing.type, label: existing.label, note: existing.note };
  sqlite.transaction(() => {
    sqlite.prepare("UPDATE manual_levels SET start_date=?,end_date=NULL WHERE id=?").run(date, id);
    insertVersion(id, nextRevision(id), "RESTORED", value, date);
  })();
  return listPriceLevels(existing.instrumentId).find((level) => level.id === id) ?? null;
}
