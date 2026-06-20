"use client";

import type { ReactNode } from "react";

type HoverTipProps = {
  label: string;
  children: ReactNode;
  className?: string;
  placement?: "top" | "bottom";
};

export function HoverTip({
  label,
  children,
  className = "",
  placement = "top",
}: HoverTipProps) {
  const positionClass =
    placement === "top"
      ? "bottom-full mb-2 group-hover/tip:translate-y-0"
      : "top-full mt-2";

  return (
    <span
      className={`group/tip relative inline-flex ${className}`.trim()}
      title={label}
    >
      {children}
      <span
        className={`pointer-events-none absolute left-1/2 -translate-x-1/2 ${positionClass} z-50 max-w-xs px-2.5 py-1.5 text-xs leading-snug text-dpm-text bg-dpm-widget border border-white/10 rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.45)] opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible transition-opacity duration-150 whitespace-normal text-center`}
      >
        {label}
      </span>
    </span>
  );
}
