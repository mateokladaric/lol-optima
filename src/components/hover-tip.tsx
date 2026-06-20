"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

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
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const updatePosition = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      x: rect.left + rect.width / 2,
      y: placement === "top" ? rect.top - 8 : rect.bottom + 8,
    });
  }, [placement]);

  const show = useCallback(() => {
    updatePosition();
    setVisible(true);
  }, [updatePosition]);

  const hide = useCallback(() => setVisible(false), []);

  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: tooltip hover anchor */}
      <span
        ref={anchorRef}
        className={`inline-flex ${className}`.trim()}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      {visible &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-[9999] max-w-xs px-2.5 py-1.5 text-xs leading-snug text-dpm-text bg-dpm-widget border border-white/10 rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.45)] whitespace-normal text-center"
            style={{
              left: pos.x,
              top: pos.y,
              transform:
                placement === "top"
                  ? "translate(-50%, -100%)"
                  : "translate(-50%, 0)",
            }}
          >
            {label}
          </div>,
          document.body,
        )}
    </>
  );
}
