"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  actionSound,
  audioSettings,
  battlefieldSound,
  createGameAudio,
  createLocalSpeech,
  spokenAction,
  spokenNotification,
  type VoiceStatus,
  DEFAULT_AUDIO,
  GAME_AUDIO_KEY,
  worldSounds,
  type GameAudioSettings,
  type GameSound,
} from "./game-audio";
import type { Action, World } from "./types";

export function useGameAudio(
  world: World | null,
  options: { paused: boolean; campaignRevision?: number },
) {
  const [settings, storeSettings] = useState<GameAudioSettings>({
    ...DEFAULT_AUDIO,
  });
  const [unlocked, setUnlocked] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>({
    available: false,
    reason: "Cihaz sesleri kontrol ediliyor…",
  });
  const speech = useRef<ReturnType<typeof createLocalSpeech> | null>(null);
  const engine = useRef<ReturnType<typeof createGameAudio> | null>(null);
  const current = useRef(world),
    previous = useRef<World | null>(null);
  const paused = useRef(options.paused),
    revision = useRef(options.campaignRevision);
  const settingsRef = useRef(settings);
  useEffect(() => {
    const sound = createGameAudio();
    engine.current = sound;
    const synthesis =
      typeof window.speechSynthesis !== "undefined" &&
      typeof window.SpeechSynthesisUtterance !== "undefined"
        ? window.speechSynthesis
        : null;
    const voice = createLocalSpeech({
      synthesis,
      utterance: (text) => new SpeechSynthesisUtterance(text),
    });
    speech.current = voice;
    const refreshVoices = () => setVoiceStatus(voice.status());
    refreshVoices();
    synthesis?.addEventListener("voiceschanged", refreshVoices);
    try {
      const stored = localStorage.getItem(GAME_AUDIO_KEY);
      if (stored) settingsRef.current = audioSettings(JSON.parse(stored));
    } catch {
      /* Audio is usable with restricted device storage. */
    }
    storeSettings(settingsRef.current);
    sound.setSettings(settingsRef.current);
    voice.setSettings(settingsRef.current);
    voice.setVisible(!document.hidden);
    sound.setActivity(!document.hidden, paused.current);
    const unlock = (event: Event) => {
      if (!event.isTrusted) return;
      voice.unlock();
      if (sound.unlock()) setUnlocked(true);
    };
    const visibility = () => {
      sound.setActivity(!document.hidden, paused.current);
      voice.setVisible(!document.hidden);
    };
    window.addEventListener("pointerdown", unlock, { capture: true });
    window.addEventListener("keydown", unlock, { capture: true });
    document.addEventListener("visibilitychange", visibility);
    let sample = 0;
    const timer = window.setInterval(() => {
      if (document.hidden || paused.current || !current.current) return;
      const cue = battlefieldSound(current.current, sample++);
      if (cue) sound.play(cue);
    }, 1250);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pointerdown", unlock, { capture: true });
      window.removeEventListener("keydown", unlock, { capture: true });
      document.removeEventListener("visibilitychange", visibility);
      sound.dispose();
      voice.dispose();
      synthesis?.removeEventListener("voiceschanged", refreshVoices);
      if (speech.current === voice) speech.current = null;
      if (engine.current === sound) engine.current = null;
    };
  }, []);
  useEffect(() => {
    paused.current = options.paused;
    engine.current?.setActivity(!document.hidden, options.paused);
  }, [options.paused]);
  useEffect(() => {
    current.current = world;
    const changedCampaign = revision.current !== options.campaignRevision;
    revision.current = options.campaignRevision;
    if (changedCampaign || !world) {
      engine.current?.reset();
      speech.current?.reset();
    } else {
      const cues = worldSounds(previous.current, world);
      for (const cue of cues) engine.current?.play(cue);
      const notification = cues.map(spokenNotification).find(Boolean);
      if (notification)
        speech.current?.speak(
          notification,
          undefined,
          cues.includes("defeat") || cues.includes("victory"),
        );
    }
    previous.current = world;
  }, [world, options.campaignRevision]);
  const setSettings = useCallback((next: GameAudioSettings) => {
    const checked = audioSettings(next);
    settingsRef.current = checked;
    storeSettings(checked);
    engine.current?.setSettings(checked);
    speech.current?.setSettings(checked);
    // Enabling the checkbox is itself a user gesture, including keyboard activation.
    if (checked.enabled && engine.current?.unlock()) setUnlocked(true);
    try {
      localStorage.setItem(GAME_AUDIO_KEY, JSON.stringify(checked));
    } catch {
      /* Optional preference. */
    }
  }, []);
  const play = useCallback(
    (cue: GameSound) => engine.current?.play(cue) ?? false,
    [],
  );
  const onAction = useCallback((action: Action) => {
    engine.current?.play(actionSound(action));
    const message = spokenAction(action, current.current);
    if (message) speech.current?.speak(message);
  }, []);
  const speak = useCallback(
    (message: string) => speech.current?.speak(message) ?? false,
    [],
  );
  return {
    settings,
    setSettings,
    play,
    onAction,
    unlocked,
    voiceStatus,
    speak,
  };
}
export type GameAudioControls = ReturnType<typeof useGameAudio>;
