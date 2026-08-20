import fs from "node:fs";
import path from "node:path";
import { databasePath, sqlite } from "@/db";

export async function backupDatabase() {
  const backupDirectory = path.join(path.dirname(databasePath), "backups");
  fs.mkdirSync(backupDirectory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `trade-journal-${stamp}.db`;
  const destination = path.join(backupDirectory, filename);
  await sqlite.backup(destination);
  const stats = fs.statSync(destination);
  return { filename, destination, bytes: stats.size, createdAt: new Date().toISOString() };
}
