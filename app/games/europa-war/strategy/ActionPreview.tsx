"use client";
import { useMemo, useState } from "react";
import { EQUIPMENT } from "./catalog";
import { previewAction } from "./commands";
import type { Action, Equipment, World } from "./types";
import styles from "../europa.module.css";

function Preview({ world, action }: { world: World; action: Action }) {
  const payload = JSON.stringify(action);
  const preview = useMemo(
    () => previewAction(world, JSON.parse(payload)),
    [world, payload],
  );
  const changes: [string, number][] = [
    ["Hazine", preview.deltas.treasury],
    ["Siyasi güç", preview.deltas.political],
    ["Yedek insan gücü", preview.deltas.manpower],
    ...Object.entries(preview.deltas.equipment).map(
      ([id, delta]): [string, number] => [
        EQUIPMENT[id as Equipment].name,
        delta!,
      ],
    ),
  ];
  return (
    <div role="status" aria-live="polite">
      <p>{preview.message}</p>
      {preview.eligible && (
        <>
          <p>Emir verildiğinde değişecek kaynaklar:</p>
          {changes.some(([, delta]) => delta !== 0) ? (
            <ul>
              {changes
                .filter(([, delta]) => delta !== 0)
                .map(([label, delta]) => (
                  <li key={label}>
                    {label}: {delta > 0 ? "+" : ""}
                    {delta.toLocaleString("tr-TR", {
                      maximumFractionDigits: 2,
                    })}
                  </li>
                ))}
            </ul>
          ) : (
            <p>
              Hemen harcanacak hazine, siyasi güç, personel veya ekipman yok.
            </p>
          )}
          <p className={styles.hint}>
            Bu bir önizlemedir. Emir verdiğinde güncel koşullar tekrar kontrol
            edilir; gelecekteki üretim ve bakım giderleri burada hesaplanmaz.
          </p>
        </>
      )}
    </div>
  );
}

/** Only clone/simulate a candidate when the player opens the preview. */
export default function ActionPreview(props: { world: World; action: Action }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className={styles.fold}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>Emir önizlemesi</summary>
      {open && <Preview {...props} />}
    </details>
  );
}
