import { z } from "zod";

export const priceLevelInputSchema = z.object({
  price: z.coerce.number().finite("价格必须是有效数字。").positive("价格必须大于 0。").max(1_000_000_000, "价格超出支持范围。"),
  type: z.enum(["SUPPORT", "RESISTANCE", "CUSTOM"]),
  label: z.string().trim().min(1, "请填写价格位名称。").max(40, "价格位名称不能超过 40 个字符。"),
  note: z.string().trim().max(500, "备注不能超过 500 个字符。").default(""),
});
