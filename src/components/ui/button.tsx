import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Button({ className, variant = "secondary", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return <button className={cn("control", variant === "primary" && "border-transparent bg-buy text-white hover:bg-buy/85", variant === "ghost" && "border-transparent bg-transparent", variant === "danger" && "border-sell/30 text-sell", className)} {...props} />;
}
