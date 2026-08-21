import { NextResponse } from "next/server";
import { createPriceLevel, listPriceLevels } from "@/lib/price-levels/persistence";
import { priceLevelInputSchema } from "@/lib/price-levels/validation";

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const instrumentId = parseId((await params).id);
  if (!instrumentId) return NextResponse.json({ message: "股票编号无效。" }, { status: 400 });
  return NextResponse.json({ levels: listPriceLevels(instrumentId) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const instrumentId = parseId((await params).id);
  if (!instrumentId) return NextResponse.json({ message: "股票编号无效。" }, { status: 400 });
  const parsed = priceLevelInputSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "价格位数据无效。" }, { status: 400 });
  const level = createPriceLevel(instrumentId, parsed.data);
  if (!level) return NextResponse.json({ message: "没有找到对应股票。" }, { status: 404 });
  return NextResponse.json({ level, levels: listPriceLevels(instrumentId) }, { status: 201 });
}
