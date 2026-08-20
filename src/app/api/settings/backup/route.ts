import { NextResponse } from "next/server";
import { backupDatabase } from "@/lib/backup";

export async function POST() {
  try {
    const result = await backupDatabase();
    return NextResponse.json({ filename: result.filename, bytes: result.bytes, createdAt: result.createdAt });
  } catch (cause) {
    return NextResponse.json({ message: cause instanceof Error ? cause.message : "数据库备份失败。" }, { status: 500 });
  }
}
