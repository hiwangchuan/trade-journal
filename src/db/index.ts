import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export const databasePath = process.env.DATABASE_URL ?? path.join(process.cwd(), "data", "trade-journal.db");
fs.mkdirSync(path.dirname(databasePath), { recursive: true });
const sqlite = new Database(databasePath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { sqlite };
