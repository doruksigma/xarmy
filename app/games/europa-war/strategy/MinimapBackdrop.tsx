"use client";
import { memo, useEffect, useMemo, useState } from "react";
import geography from "./map-data.json";
import {
  MINIMAP_COLORS,
  minimapBitmap,
  minimapPixelRatio,
  minimapSignature,
} from "./minimap";
import type { World } from "./types";

const RasterBackdrop = memo(function RasterBackdrop({
  signature,
}: {
  signature: string;
}) {
  const [image, setImage] = useState<string | null>(null);
  const [ratio, setRatio] = useState(() =>
    typeof window === "undefined"
      ? 1
      : minimapPixelRatio(window.devicePixelRatio),
  );
  useEffect(() => {
    let resolution: MediaQueryList | undefined;
    const refresh = () => {
      setRatio(minimapPixelRatio(window.devicePixelRatio));
      resolution?.removeEventListener("change", refresh);
      resolution = window.matchMedia(
        `(resolution: ${window.devicePixelRatio}dppx)`,
      );
      resolution.addEventListener("change", refresh);
    };
    refresh();
    window.addEventListener("resize", refresh);
    return () => {
      window.removeEventListener("resize", refresh);
      resolution?.removeEventListener("change", refresh);
    };
  }, []);
  useEffect(() => {
    setImage(minimapBitmap(signature, ratio));
  }, [signature, ratio]);

  if (image)
    return (
      <image
        data-testid="minimap-backdrop"
        href={image}
        width={geography.width}
        height={geography.height}
        preserveAspectRatio="none"
        pointerEvents="none"
        aria-hidden="true"
      />
    );
  return (
    <g
      data-testid="minimap-vector-fallback"
      pointerEvents="none"
      aria-hidden="true"
    >
      {geography.provinces.map((province, index) => (
        <path
          key={province.id}
          d={province.path}
          fill={MINIMAP_COLORS[Number(signature[index])] ?? MINIMAP_COLORS[3]}
          fillRule="evenodd"
          stroke="#1e302d"
          strokeWidth="1"
        />
      ))}
    </g>
  );
});

/** Camera/hover updates skip this tree; simulation ticks compare visual colors. */
export default memo(function MinimapBackdrop({ world }: { world: World }) {
  const signature = useMemo(() => minimapSignature(world), [world]);
  return <RasterBackdrop signature={signature} />;
});
