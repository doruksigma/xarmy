import type { RoomView } from "@/lib/chess-room";
import styles from "./chess-arena.module.css";

const faces = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

export default function ColorDraw({ room }: { room: RoomView }) {
  const draw = room.colorDraw;
  return (
    <div
      data-testid="color-draw"
      className="mb-3 rounded-xl border border-emerald-400/25 bg-emerald-400/5 px-3 py-2 text-center text-xs text-emerald-200"
      role="status"
    >
      {!room.colorsDrawn ? (
        <p>🎲 Arkadaşın katılınca ikiniz için zar atılacak.</p>
      ) : (
        <>
          {draw && (
            <div className="mb-1 flex items-center justify-center gap-5">
              <span>
                <span
                  aria-hidden="true"
                  className={`${styles.dice} mr-1 inline-block text-3xl align-middle`}
                >
                  {faces[draw.yourRoll]}
                </span>
                Sen: {draw.yourRoll}
              </span>
              <span>
                <span
                  aria-hidden="true"
                  className={`${styles.dice} mr-1 inline-block text-3xl align-middle`}
                >
                  {faces[draw.opponentRoll]}
                </span>
                Arkadaşın: {draw.opponentRoll}
              </span>
            </div>
          )}
          <p>
            {draw ? "Kura sonucu: " : "Taş rengin: "}
            <strong>{room.color === "w" ? "Beyaz" : "Siyah"}</strong> taşlarla
            oynuyorsun.{draw && " Büyük zar beyazla başlar."}
          </p>
          {!draw && <p className="mt-1">Yeni maçta renkler zarla belirlenecek.</p>}
        </>
      )}
    </div>
  );
}
