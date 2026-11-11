import type { Equipment } from "./types";
import styles from "./production-panel.module.css";

/** Original compact equipment plates; no external textures or game assets. */
export default function EquipmentIllustration({
  equipment,
}: {
  equipment: Equipment;
}) {
  const tank = ["lightTank", "mediumTank", "heavyTank"].includes(equipment);
  const ship = [
    "destroyer",
    "battleship",
    "ship",
    "submarine",
    "carrier",
  ].includes(equipment);
  const aircraft = [
    "fighter",
    "bomber",
    "strategicBomber",
    "reconPlane",
    "transport",
    "carrierFighter",
  ].includes(equipment);
  return (
    <svg
      className={styles.illustration}
      viewBox="0 0 120 64"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className={styles.plateGrid}
        d="M0 16h120M0 32h120M0 48h120M20 0v64M40 0v64M60 0v64M80 0v64M100 0v64"
      />
      <ellipse className={styles.modelShadow} cx="60" cy="54" rx="48" ry="5" />
      <g className={styles.model}>
        {tank ? (
          <>
            <path d="M15 36h74l14 8-5 10H20L10 46Z" />
            <path d="m23 29 60-2 12 12H18Zm14-2 6-13h29l12 14" />
            <path
              d={`M72 19h${equipment === "heavyTank" ? 40 : equipment === "mediumTank" ? 33 : 24}v5H72ZM45 14v-4h18v4`}
            />
            <path d="M20 42h72l5 5-4 4H21l-5-5ZM27 42v9m13-9v9m13-9v9m13-9v9m13-9v9M28 31h8m9-11h10m-24 15h48" />
            <circle cx="47" cy="20" r="2" />
          </>
        ) : equipment === "truck" ? (
          <>
            <path d="M12 22h58v23H12ZM73 26h20l12 13v10H69V22h14" />
            <path d="M75 29h15l7 11H75ZM13 27h55M19 23v21m14-21v21m14-21v21m14-21v21M14 49h86" />
            <circle cx="29" cy="48" r="8" />
            <circle cx="29" cy="48" r="3" />
            <circle cx="88" cy="48" r="8" />
            <circle cx="88" cy="48" r="3" />
          </>
        ) : equipment === "artillery" ? (
          <>
            <path d="m50 29 55-15 2 5-55 17-23 20H15l35-27Z" />
            <path d="m45 22 18-5 5 22-20 5Z" />
            <path d="m36 40-13 13m40-18 13 20h18M51 25l9-2" />
            <circle cx="52" cy="44" r="12" />
            <circle cx="52" cy="44" r="4" />
            <path d="M40 44h24M52 32v24m-9-21 18 18m0-18-18 18" />
          </>
        ) : aircraft ? (
          <>
            <path d="m56 7 7 0 3 19 43 15v7L66 37l-2 13 14 8v3l-18-3-18 3v-3l14-8-2-13-43 11v-7l43-15Z" />
            <path d="M57 18h6M56 22h8M60 8v44m-29-16v9m57-9v9M18 43l20-7m44 0 19 7" />
            {equipment !== "fighter" && equipment !== "carrierFighter" && (
              <path d="M38 29v13m44-13v13M34 32h8m36 0h8" />
            )}
          </>
        ) : ship ? (
          <>
            {equipment === "submarine" ? (
              <>
                <path d="M16 34h84c17 0 17 14 0 14H20C2 48 2 34 16 34ZM48 34V23h21v11m-10-11V12h10" />
                <path d="M20 39h73m-40-12h10m-49 19h85" />
              </>
            ) : (
              <>
                <path d="m9 40 10 14h81l12-14ZM31 40V28h49v12m-33-12V17h18v11m-10-11V7m-6 7h17M78 31h21m-68 2H17" />
                <path d="M24 46h71m-45-23h11m-24 13h35" />
                {equipment === "carrier" && (
                  <path d="M15 35h90v5H15ZM27 37h64" />
                )}
              </>
            )}
            <path d="M4 58q8-4 16 0t16 0t16 0t16 0t16 0t16 0t16 0" />
          </>
        ) : (
          <>
            <path d="m12 50 17-10 14-2 45-24 23-4 1 4-25 7-39 26-14 1-15 12Z" />
            <path d="m49 36 9 9 7-4-8-9m4-2 17-10 2 4-17 10M83 17l3 5M17 49l9 5m12-11 10-1" />
          </>
        )}
      </g>
    </svg>
  );
}
