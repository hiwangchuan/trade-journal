import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "buy" | "sell" | "warning" }) { return <span className={cn("inline-flex h-6 items-center rounded-md border px-2 text-[10px] font-semibold", tone === "neutral" && "border-line text-muted", tone === "buy" && "border-buy/35 text-buy", tone === "sell" && "border-sell/35 text-sell", tone === "warning" && "border-yellow-500/35 text-yellow-500")}>{children}</span>; }
