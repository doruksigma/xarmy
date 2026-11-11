"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  historicalDecisionView,
  pendingHistoricalDecision,
} from "./historical-events";
import MilitaryIcon from "./MilitaryIcon";
import { dateLabel } from "./world";
import type { Action, World } from "./types";
import styles from "./historical-events.module.css";

/** Native modal focus containment also makes the map behind the decision inert. */
export default function HistoricalEventDialog({
  world,
  onAction,
  onType,
  animations = true,
}: {
  world: World;
  onAction: (action: Action) => boolean | void;
  onType?: () => void;
  animations?: boolean;
}) {
  const decision = pendingHistoricalDecision(world);
  return decision ? (
    <DecisionDialog
      key={decision.id}
      world={world}
      decision={decision}
      onAction={onAction}
      onType={onType}
      animations={animations}
    />
  ) : null;
}

function DecisionDialog({
  world,
  decision,
  onAction,
  onType,
  animations,
}: {
  world: World;
  decision: NonNullable<ReturnType<typeof pendingHistoricalDecision>>;
  onAction: (action: Action) => boolean | void;
  onType?: () => void;
  animations: boolean;
}) {
  const view = historicalDecisionView(world, decision);
  const dialog = useRef<HTMLDialogElement>(null);
  const typingSound = useRef(onType);
  const typingStopped = useRef(false);
  const submitting = useRef(false);
  const [visible, setVisible] = useState(
    animations ? 0 : view.description.length,
  );
  const [sending, setSending] = useState(false);
  const titleId = useId(),
    bodyId = useId();
  const text = view.description;
  const complete = !animations || visible >= text.length;

  useEffect(() => {
    typingSound.current = onType;
  }, [onType]);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    if (element && !element.open) element.showModal();
    return () => {
      element?.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!animations || motion.matches || typingStopped.current) {
      typingStopped.current = true;
      setVisible(text.length);
      return;
    }
    let count = 0;
    const timer = window.setInterval(() => {
      if (typingStopped.current) {
        window.clearInterval(timer);
        return;
      }
      count = Math.min(text.length, count + 3);
      setVisible(count);
      if (!document.hidden) typingSound.current?.();
      if (count >= text.length) window.clearInterval(timer);
    }, 65);
    const reduce = () => {
      if (motion.matches) {
        window.clearInterval(timer);
        setVisible(text.length);
      }
    };
    motion.addEventListener("change", reduce);
    return () => {
      window.clearInterval(timer);
      motion.removeEventListener("change", reduce);
    };
  }, [text, animations]);

  function reveal() {
    typingStopped.current = true;
    setVisible(text.length);
  }

  function choose(choice: "accept" | "decline") {
    if (submitting.current) return;
    submitting.current = true;
    setSending(true);
    const success = onAction({
      type: "historicalChoice",
      id: decision.id,
      choice,
    });
    if (success === false) {
      submitting.current = false;
      setSending(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      data-testid="historical-decision"
      onCancel={(event) => {
        event.preventDefault();
        reveal();
      }}
    >
      <div className={styles.documentHeader}>
        <span>
          <MilitaryIcon name="diplomacy" size={19} /> DİPLOMATİK TELGRAF
        </span>
        <time>{dateLabel(world.day)}</time>
      </div>
      <div className={styles.documentBody}>
        <div className={styles.stamp}>
          {decision.stage === "respond"
            ? "YANIT BEKLENİYOR"
            : "HAZIRLIK TAMAMLANDI"}
        </div>
        <p className={styles.address}>
          {world.countries[decision.initiator]?.name} →{" "}
          {world.countries[decision.recipient]?.name} · Devlet başkanlığına
        </p>
        <h2 id={titleId}>{view.title}</h2>
        <div className={styles.typewriter}>
          <p aria-hidden="true">
            {animations ? text.slice(0, visible) : text}
            {!complete && <span className={styles.caret}>▌</span>}
          </p>
          <p id={bodyId} className={styles.srOnly}>
            {text}
          </p>
        </div>
        {!complete && (
          <button
            type="button"
            data-testid="historical-reveal"
            className={styles.reveal}
            onClick={reveal}
          >
            Metnin tamamını göster <span aria-hidden="true">↵</span>
          </button>
        )}
        <p className={styles.pauseNote}>
          Zaman duraklatıldı. Kararların etkisini aşağıda okuyup seçimini
          yapabilirsin.
        </p>
        {view.blockedReason && (
          <p className={styles.blocked} role="status">
            {view.blockedReason}
          </p>
        )}
        <div className={styles.choices}>
          <div>
            <p>{view.effectText}</p>
            <button
              type="button"
              data-testid="historical-accept"
              className={styles.accept}
              disabled={sending || !!view.blockedReason}
              onClick={() => choose("accept")}
            >
              <MilitaryIcon name="check" size={17} />
              {view.acceptLabel}
            </button>
          </div>
          <div>
            <p>{view.declineText}</p>
            <button
              type="button"
              data-testid="historical-decline"
              className={styles.decline}
              disabled={sending}
              onClick={() => choose("decline")}
            >
              {view.declineLabel}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
