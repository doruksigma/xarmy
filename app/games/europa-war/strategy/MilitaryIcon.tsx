import type { SVGProps } from "react";
import type { Building, Equipment, Resource, UnitType } from "./types";
import styles from "./military-icon.module.css";
import { MILITARY_MAP_PATHS } from "./military-symbols";

/** Original engraved military symbols. Shared by HTML controls and SVG maps. */
const DRAWINGS = {
  capital: <path d={MILITARY_MAP_PATHS.capital} />,
  command: (
    <>
      <path d="m12 2 2.5 5.6 6.1.6-4.6 4 1.4 6-5.4-3.2L6.6 18l1.4-5.8-4.6-4 6.1-.6Z" />
      <path d="M3 15c0 4 3 7 7 7m11-7c0 4-3 7-7 7M5 16l-2 1m4 2-2 1m14-4 2 1m-4 2 2 1" />
    </>
  ),
  province: (
    <>
      <path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2ZM9 3v16m6-14v16" />
      <path d="m6 10 2 3 4-4 5 5 2-3" />
    </>
  ),
  infantry: <path d={MILITARY_MAP_PATHS.infantry} />,
  armor: <path d={MILITARY_MAP_PATHS.tank} />,
  artillery: <path d={MILITARY_MAP_PATHS.artillery} />,
  truck: <path d={MILITARY_MAP_PATHS.truck} />,
  mechanized: (
    <>
      <rect x="2" y="5" width="20" height="13" rx="1" />
      <path d="m4 7 16 9M20 7 4 16" />
      <rect x="8" y="9" width="8" height="5" rx="2.5" />
      <path d="M5 21h14" />
    </>
  ),
  special: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="1" />
      <path d="m12 7 1.4 3 3.3.5-2.4 2.3.6 3.2-2.9-1.5-2.9 1.5.6-3.2-2.4-2.3 3.3-.5Z" />
    </>
  ),
  mountain: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="1" />
      <path d="m5 16 4-7 3 4 3-6 4 9M9 9l1 4m5-6 1 5" />
    </>
  ),
  parachute: (
    <>
      <path d="M3 10a9 8 0 0 1 18 0ZM8 10c0-10 8-10 8 0M3 10l9 9 9-9M8 10l4 9 4-9m-4 9v3" />
    </>
  ),
  rifle: (
    <>
      <path d="m3 20 4-2 3-4 10-9-1-2L8 13l-4 2Zm7-6 3 2 2-2-3-2M8 16l2 2m8-13 2 2" />
    </>
  ),
  factory: (
    <>
      <path d="M2 21V11l6-4v4l6-4v7h7v7ZM16 14V3h4v11M5 16v2m4-2v2m8-1v2" />
    </>
  ),
  diplomacy: (
    <>
      <path d="m2 10 5-5 5 2 5-2 5 5-4 8-4 2-4-2-3-5-3-2Zm5-5 2 5 3-3m0 0-2 4 2 2 3-3 5 3M8 14l5 5m-2-7 6 6M2 10l3 2m17-2-3 2" />
    </>
  ),
  research: (
    <>
      <path d="M9 3h6m-5 0v7L4 20q-.3 1 1 1h14q1.3 0 1-1l-6-10V3M7 15h10" />
      <circle cx="10" cy="17.5" r=".6" fill="currentColor" />
      <circle cx="14" cy="18.5" r=".6" fill="currentColor" />
    </>
  ),
  politics: (
    <>
      <path d="m2 7 10-5 10 5ZM3 21h18M5 10v8m5-8v8m4-8v8m5-8v8M3 9h18M3 19h18" />
    </>
  ),
  operations: (
    <>
      <path d="m3 3 7 3 11-3v16l-11 3-7-3ZM6 16l4-5 5 2 3-5m-4 0h4v4" />
      <circle cx="6" cy="16" r="1.2" />
    </>
  ),
  espionage: (
    <>
      <path d="M2 12q10-13 20 0-10 13-20 0Z" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </>
  ),
  save: (
    <>
      <path d="M4 3h14l3 3v15H3V3ZM7 3v6h10V3M7 21v-8h10v8M14 5v2" />
    </>
  ),
  load: (
    <>
      <path d="M3 20V5h7l2 3h9v12ZM12 10v7m-3-3 3 3 3-3" />
    </>
  ),
  download: (
    <>
      <path d="M12 2v13m-5-5 5 5 5-5M3 16v5h18v-5" />
    </>
  ),
  play: <path d="m7 3 14 9-14 9Z" fill="currentColor" stroke="none" />,
  pause: (
    <path d="M5 3h5v18H5Zm9 0h5v18h-5Z" fill="currentColor" stroke="none" />
  ),
  reset: (
    <>
      <path d="M4 9a8 8 0 1 1 0 6m0-12v6h6" />
    </>
  ),
  plus: <path d="M12 4v16M4 12h16" />,
  minus: <path d="M4 12h16" />,
  focus: (
    <>
      <circle cx="12" cy="12" r="6" />
      <path d="M12 1v6m0 10v6M1 12h6m10 0h6" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" />
    </>
  ),
  fit: (
    <>
      <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M3 3l6 6m12-6-6 6M3 21l6-6m12 6-6-6" />
    </>
  ),
  select: (
    <>
      <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />
      <rect x="7" y="8" width="10" height="8" />
      <path d="m8 9 8 6m0-6-8 6" />
    </>
  ),
  attack: (
    <>
      <path d="m4 20 5-5m-4-1 5 5M7 14 17 4l4-1-1 4-10 10M4 3l4 1 6 6m3 4 3 6m-6-1 5-5" />
    </>
  ),
  defend: (
    <>
      <path d="m12 2 8 3v6c0 5-4 9-8 11-4-2-8-6-8-11V5Z" />
      <path d="M12 6v12M7 11h10" />
    </>
  ),
  plane: (
    <path d="m11 2 2 0 1 7 8 5v2l-8-2-.5 5 2.5 2v1l-4-1-4 1v-1l2.5-2-.5-5-8 2v-2l8-5Z" />
  ),
  bomber: (
    <>
      <path d="m11 2 2 0 1 7 8 4v3l-8-2v5l3 2v1l-5-1-5 1v-1l3-2v-5l-8 2v-3l8-4Z" />
      <path d="M6 11V8m12 3V8" />
    </>
  ),
  navy: (
    <>
      <circle cx="12" cy="4" r="2" />
      <path d="M12 6v15M8 9h8M3 14c0 5 4 7 9 7s9-2 9-7M3 14v4m0-4 4 1m14-1v4m0-4-4 1" />
    </>
  ),
  ship: (
    <>
      <path d="m2 15 3 5h14l3-5ZM6 15v-5h10v5m-6-5V5h3v5m-1-5V2M1 22q3-3 6 0 3-3 6 0 3-3 6 0 2-2 4 0" />
    </>
  ),
  submarine: (
    <>
      <path d="M3 13h16a4 4 0 0 1 0 8H5a4 4 0 0 1-2-8ZM9 13V9h7v4m-4-4V4h3M2 10h4m13-1h3" />
    </>
  ),
  carrier: (
    <>
      <path d="M2 12h20l-4 9H6ZM7 12V7h6v5m-3-5V3M7 16h11m-10 3h8" />
    </>
  ),
  treasury: (
    <>
      <ellipse cx="9" cy="6" rx="6" ry="3" />
      <path d="M3 6v10c0 4 12 4 12 0V6M3 11c0 4 12 4 12 0" />
      <path d="M16 10h3c4 0 4 10 0 10h-4" />
    </>
  ),
  manpower: (
    <>
      <circle cx="12" cy="6" r="3" />
      <path d="M6 21v-5a6 6 0 0 1 12 0v5M3 4a3 3 0 0 1 0 6m0 3a4 4 0 0 0-2 4m20-13a3 3 0 0 0 0 6m0 3a4 4 0 0 1 2 4" />
    </>
  ),
  tension: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2c-6 4-6 16 0 20 6-4 6-16 0-20m0 5v6" />
      <circle cx="12" cy="16" r=".7" fill="currentColor" />
    </>
  ),
  oil: (
    <>
      <path d="M12 2c-2 5-8 9-8 14a8 6 0 0 0 16 0c0-5-6-9-8-14Z" />
      <path d="M8 14c-2 3 0 5 2 5" />
    </>
  ),
  steel: (
    <>
      <path d="m3 9 5-4h13l-5 4Zm0 0v6l13 4v-10m0 10 5-5V5M3 15l13 4" />
    </>
  ),
  rubber: (
    <>
      <ellipse cx="12" cy="12" rx="8" ry="10" />
      <ellipse cx="12" cy="12" rx="4" ry="6" />
      <path d="m6 4 3 2m9-2-3 2M4 10h4m12 0h-4M5 17l3-2m11 2-3-2" />
    </>
  ),
  rail: (
    <>
      <path d="M7 2 3 22M17 2l4 20M6 6h12M5 10h14M4 14h16M3 18h18" />
    </>
  ),
  supply: (
    <>
      <path d="m3 6 9-4 9 4v14H3ZM3 6l9 4 9-4m-9 4v10M8 4l9 4v6" />
    </>
  ),
  fort: (
    <>
      <path d="M2 21V9h4V5h4v4h4V5h4v4h4v12ZM9 21v-7h6v7" />
    </>
  ),
  radar: (
    <>
      <path d="m4 3 13 13A10 10 0 0 1 4 3ZM11 13l-3 8m8-6 2 6M5 21h16M15 3a6 6 0 0 1 6 6m-6-2a2 2 0 0 1 2 2" />
    </>
  ),
  medal: (
    <>
      <path d="M6 2h5l1 8-5 3Zm7 0h5l-1 11-5-3Z" />
      <circle cx="12" cy="16" r="6" />
      <path d="m12 12 1 2 2 .5-1.5 1.5.5 2-2-1-2 1 .5-2L9 14.5l2-.5Z" />
    </>
  ),
  check: <path d="m4 12 5 5L21 5" />,
  close: <path d="m5 5 14 14M19 5 5 19" />,
} as const;

export type MilitaryIconName = keyof typeof DRAWINGS;
export type MilitaryIconProps = Omit<
  SVGProps<SVGSVGElement>,
  "name" | "color"
> & {
  name: MilitaryIconName;
  size?: number;
  color?: string;
  label?: string;
};

export default function MilitaryIcon({
  name,
  size = 18,
  color = "currentColor",
  label,
  className,
  style,
  ...props
}: MilitaryIconProps) {
  return (
    <svg
      {...props}
      className={`${styles.icon}${className ? ` ${className}` : ""}`}
      style={{ color, ...style }}
      data-military-icon={name}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      focusable="false"
    >
      {DRAWINGS[name]}
    </svg>
  );
}

export function unitIcon(type: UnitType): MilitaryIconName {
  return {
    infantry: "infantry",
    artillery: "artillery",
    motorized: "truck",
    mechanized: "mechanized",
    lightTank: "armor",
    mediumTank: "armor",
    heavyTank: "armor",
    special: "special",
    mountain: "mountain",
    paratrooper: "parachute",
  }[type] as MilitaryIconName;
}
export function equipmentIcon(type: Equipment): MilitaryIconName {
  if (type.endsWith("Tank")) return "armor";
  return (
    (
      {
        rifle: "rifle",
        artillery: "artillery",
        truck: "truck",
        fighter: "plane",
        carrierFighter: "plane",
        reconPlane: "plane",
        transport: "plane",
        bomber: "bomber",
        strategicBomber: "bomber",
        ship: "ship",
        destroyer: "ship",
        battleship: "ship",
        submarine: "submarine",
        carrier: "carrier",
      } as Partial<Record<Equipment, MilitaryIconName>>
    )[type] ?? "supply"
  );
}
export function buildingIcon(type: Building): MilitaryIconName {
  return {
    civil: "factory",
    military: "factory",
    dock: "navy",
    infra: "province",
    rail: "rail",
    hub: "supply",
    refinery: "oil",
    synthetic: "rubber",
    fort: "fort",
    radar: "radar",
    mine: "steel",
    airfield: "plane",
    antiAir: "artillery",
  }[type] as MilitaryIconName;
}
export function resourceIcon(type: Resource): MilitaryIconName {
  return type === "oil" || type === "fuel"
    ? "oil"
    : type === "rubber"
      ? "rubber"
      : "steel";
}
