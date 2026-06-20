"use client";

import { useEffect, useState } from "react";
import {
  itemIconUrl,
  loadDdragonAssets,
  type DdragonAssets,
} from "@/lib/ddragonIcons";

type ItemIconProps = {
  name: string;
  size?: number;
  className?: string;
};

export function ItemIcon({ name, size = 36, className = "" }: ItemIconProps) {
  const [assets, setAssets] = useState<DdragonAssets | null>(null);

  useEffect(() => {
    loadDdragonAssets()
      .then(setAssets)
      .catch(() => {});
  }, []);

  const src = assets ? itemIconUrl(assets, name) : null;

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-dpm-bg/80 border border-white/10 ${className}`.trim()}
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
