"use client";

import { useEffect, useState } from "react";
import {
  championIconUrl,
  loadDdragonAssets,
  type DdragonAssets,
} from "@/lib/ddragonIcons";

type ChampionIconProps = {
  name: string;
  size?: number;
  className?: string;
};

export function ChampionIcon({
  name,
  size = 32,
  className = "",
}: ChampionIconProps) {
  const [assets, setAssets] = useState<DdragonAssets | null>(null);

  useEffect(() => {
    loadDdragonAssets()
      .then(setAssets)
      .catch(() => {});
  }, []);

  const src = assets ? championIconUrl(assets, name) : null;
  const initials = name.slice(0, 1).toUpperCase();

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
        <span className="text-[10px] font-bold text-dpm-muted">{initials}</span>
      )}
    </span>
  );
}
