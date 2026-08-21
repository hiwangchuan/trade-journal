import { NextResponse } from "next/server";
import { archivePriceLevel, listPriceLevels, restorePriceLevel, updatePriceLevel } from "@/lib/price-levels/persistence";
import { priceLevelInputSchema } from "@/lib/price-levels/validation";

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ message: "价格位编号无效。" }, { status: 400 });
  const body = await request.json();
  const level = body?.action === "RESTORE"
    ? restorePriceLevel(id)
    : (() => {
        const parsed = priceLevelInputSchema.safeParse(body);
        if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "价格位数据无效。" } as const;
        return updatePriceLevel(id, parsed.data);
      })();
  if (level && "error" in level) return NextResponse.json({ message: level.error }, { status: 400 });
  if (!level) return NextResponse.json({ message: "价格位不存在，或当前状态不允许此操作。" }, { status: 409 });
  return NextResponse.json({ level, levels: listPriceLevels(level.instrumentId) });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ message: "价格位编号无效。" }, { status: 400 });
  const level = archivePriceLevel(id);
  if (!level) return NextResponse.json({ message: "价格位不存在或已经归档。" }, { status: 409 });
  return NextResponse.json({ archived: true, level, levels: listPriceLevels(level.instrumentId) });
}
