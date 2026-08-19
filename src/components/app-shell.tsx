"use client";
import { Activity, BarChart3, BookOpenText, ChartCandlestick, LayoutDashboard, Search, Settings, TableProperties } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, type ReactNode, useState } from "react";
import { ThemeToggle } from "./theme-toggle";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "概览", icon: LayoutDashboard }, { href: "/stocks", label: "股票", icon: ChartCandlestick }, { href: "/trades", label: "交易", icon: TableProperties }, { href: "/analytics", label: "分析", icon: BarChart3 }, { href: "/settings", label: "设置", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname(); const router = useRouter(); const [query, setQuery] = useState("");
  const submit = (event: FormEvent) => { event.preventDefault(); if (query.trim()) router.push(`/stocks/${encodeURIComponent(query.trim().toUpperCase())}`); };
  const isActive = (href: string) => href === "/" ? pathname === "/" : pathname.startsWith(href);
  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/" className="sidebar-brand"><span className="grid h-7 w-7 place-items-center rounded-lg border border-buy/30 bg-buy/10 text-buy"><Activity size={17} /></span>交易复盘</Link>
      <nav className="sidebar-nav">{nav.map(({ href, label, icon: Icon }) => { const active = isActive(href); return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("nav-item", active && "active")}><Icon size={17} strokeWidth={1.7} />{label}</Link>; })}</nav>
      <div className="mt-auto p-4 text-[10px] leading-4 text-muted"><BookOpenText size={15} className="mb-2" />交易背景只使用当时已知的数据，后续结果始终单独展示。</div>
    </aside>
    <main className="shell-main">
      <header className="global-topbar"><form className="search-box" onSubmit={submit}><Search size={15} className="text-muted" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索股票代码…" aria-label="搜索股票代码" /><kbd className="hidden rounded border border-line px-1.5 py-0.5 text-[9px] text-muted sm:block">⌘ K</kbd></form><ThemeToggle /></header>
      {children}
    </main>
    <nav className="mobile-nav">{nav.map(({ href, label, icon: Icon }) => { const active = isActive(href); return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={active ? "active" : undefined}><Icon size={17} />{label}</Link>; })}</nav>
  </div>;
}
