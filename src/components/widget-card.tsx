import type { ReactNode } from "react";

type GlowVariant = "purple" | "blue" | "gold" | "none";

type WidgetCardProps = {
  title?: string;
  subtitle?: string;
  glow?: GlowVariant;
  className?: string;
  children: ReactNode;
};

const glowClasses: Record<GlowVariant, string> = {
  purple: "dpm-widget-glow dpm-widget-glow-purple",
  blue: "dpm-widget-glow dpm-widget-glow-blue",
  gold: "dpm-widget-glow dpm-widget-glow-gold",
  none: "",
};

export function WidgetCard({
  title,
  subtitle,
  glow = "none",
  className = "",
  children,
}: WidgetCardProps) {
  return (
    <div className={`dpm-widget ${glowClasses[glow]} ${className}`.trim()}>
      {(title || subtitle) && (
        <div className="mb-3">
          {title && (
            <h3 className="text-sm font-semibold text-dpm-text">{title}</h3>
          )}
          {subtitle && (
            <p className="text-xs text-dpm-muted mt-0.5">{subtitle}</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
