"use client";

import { CircleHelp } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useRef, useState } from "react";

type Position = { left: number; top: number; above: boolean };

export function TermTooltip({ term, description, className = "" }: { term: string; description: string; className?: string }) {
  const id = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);

  const updatePosition = useCallback(() => {
    const element = triggerRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const halfWidth = Math.min(140, (window.innerWidth - 24) / 2);
    setPosition({
      left: Math.max(halfWidth + 12, Math.min(window.innerWidth - halfWidth - 12, rect.left + rect.width / 2)),
      top: rect.top > 118 ? rect.top - 9 : rect.bottom + 9,
      above: rect.top > 118,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  return <>
    <span
      ref={triggerRef}
      className={`inline-flex cursor-help items-center gap-1 rounded-sm underline decoration-dotted decoration-muted/60 underline-offset-[3px] outline-none focus-visible:ring-2 focus-visible:ring-buy/70 ${className}`}
      tabIndex={0}
      aria-describedby={open ? id : undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {term}<CircleHelp size={11} className="shrink-0 opacity-65" aria-hidden="true" />
    </span>
    {open && position ? createPortal(
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none fixed z-[100] w-max max-w-[min(280px,calc(100vw-24px))] rounded-lg border border-line bg-surface px-3 py-2 text-left text-[11px] font-normal leading-[1.55] tracking-normal text-ink shadow-[0_12px_36px_rgba(0,0,0,.35)]"
        style={{ left: position.left, top: position.top, transform: position.above ? "translate(-50%, -100%)" : "translateX(-50%)" }}
      >
        <strong className="mb-0.5 block text-[11px] font-semibold text-ink">{term}</strong>
        <span className="text-muted">{description}</span>
      </span>,
      document.body,
    ) : null}
  </>;
}
