import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { getWorkspace } from "@/lib/data";
import { getDcaAnalysis } from "@/lib/dca/persistence";

export const runtime = "nodejs";

function workspaceForId(id: number) {
  const instrument = sqlite.prepare("SELECT symbol FROM instruments WHERE id=?").get(id) as { symbol: string } | undefined;
  return instrument ? getWorkspace(instrument.symbol) : null;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const instrumentId = Number((await params).id);
  if (!Number.isInteger(instrumentId) || instrumentId <= 0) return NextResponse.json({ message: "股票ID无效。" }, { status: 400 });
  const workspace = workspaceForId(instrumentId);
  if (!workspace) return NextResponse.json({ message: "未找到该股票。" }, { status: 404 });
  try {
    return NextResponse.json(getDcaAnalysis(workspace));
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "定投曲线计算失败。";
    console.error("DCA analysis failed:", message);
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const instrumentId = Number((await params).id);
  if (!Number.isInteger(instrumentId) || instrumentId <= 0) return NextResponse.json({ message: "股票ID无效。" }, { status: 400 });
  const workspace = workspaceForId(instrumentId);
  if (!workspace) return NextResponse.json({ message: "未找到该股票。" }, { status: 404 });
  try {
    return NextResponse.json(getDcaAnalysis(workspace, { force: true }));
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "定投曲线重建失败。";
    console.error("DCA rebuild failed:", message);
    return NextResponse.json({ message }, { status: 500 });
  }
}
