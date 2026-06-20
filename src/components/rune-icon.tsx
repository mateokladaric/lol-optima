"use client";

import { useEffect, useState } from "react";
import {
  keystoneIconUrl,
  loadDdragonAssets,
  type DdragonAssets,
} from "@/lib/ddragonIcons";

type RuneIconProps = {
  name: string;
  size?: number;
  className?: string;
};

export function RuneIcon({ name, size = 32, className = "" }: RuneIconProps) {
  const [assets, setAssets] = useState<DdragonAssets | null>(null);

  useEffect(() => {
    loadDdragonAssets()
      .then(setAssets)
      .catch(() => {});
  }, []);

  const src = assets ? keystoneIconUrl(assets, name) : null;

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-dpm-bg/80 border border-white/10 ${className}`.trim()}
      style={{ width: size, height: size }}
    >
      {src ? (
        // biome-ignore lint/performance/noImgElement: external CDN asset
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <span className="text-[8px] font-bold text-dpm-muted px-0.5 text-center leading-none">
          ?
        </span>
      )}
    </span>
  );
}
