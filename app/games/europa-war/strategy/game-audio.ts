import type { Action, World } from "./types";

export type GameSound =
  | "click"
  | "start"
  | "save"
  | "load"
  | "error"
  | "order"
  | "halt"
  | "research"
  | "complete"
  | "focus"
  | "diplomacy"
  | "decision"
  | "build"
  | "recruit"
  | "capture"
  | "defeat"
  | "victory"
  | "typewriter"
  | "rifle"
  | "artillery"
  | "armor"
  | "footstep"
  | "engine"
  | "aircraft"
  | "naval"
  | "warDeclaration"
  | "alliance"
  | "pact"
  | "trade"
  | "embargo"
  | "aid"
  | "peace"
  | "liberation"
  | "commander"
  | "defend"
  | "assault"
  | "plan"
  | "airOrder"
  | "navalOrder"
  | "commission"
  | "wingReady"
  | "intelligence"
  | "agentReady"
  | "counterIntel"
  | "sabotage"
  | "railBuild"
  | "production"
  | "policy"
  | "cancel"
  | "focusComplete"
  | "buildComplete"
  | "recruitComplete"
  | "historicalAccept"
  | "historicalDecline"
  | "bombing"
  | "support";
export interface GameAudioSettings {
  enabled: boolean;
  volume: number;
  effects: boolean;
  battle: boolean;
  /** Opt-in, on-device Turkish speech only. Absent in older stored preferences. */
  voice: boolean;
}
export const GAME_AUDIO_KEY = "xarmy-europa-audio-v1";
export const DEFAULT_AUDIO: GameAudioSettings = {
  enabled: true,
  volume: 0.42,
  effects: true,
  battle: true,
  voice: false,
};
const battlefield = new Set<GameSound>([
  "rifle",
  "artillery",
  "armor",
  "footstep",
  "engine",
  "aircraft",
  "naval",
  "bombing",
]);
export function isBattleSound(cue: GameSound) {
  return battlefield.has(cue);
}
export function audioSettings(value: unknown): GameAudioSettings {
  const input =
    value && typeof value === "object"
      ? (value as Partial<GameAudioSettings>)
      : {};
  return {
    enabled:
      typeof input.enabled === "boolean"
        ? input.enabled
        : DEFAULT_AUDIO.enabled,
    volume:
      typeof input.volume === "number" && Number.isFinite(input.volume)
        ? Math.min(1, Math.max(0, input.volume))
        : DEFAULT_AUDIO.volume,
    effects:
      typeof input.effects === "boolean"
        ? input.effects
        : DEFAULT_AUDIO.effects,
    battle:
      typeof input.battle === "boolean" ? input.battle : DEFAULT_AUDIO.battle,
    voice: typeof input.voice === "boolean" ? input.voice : false,
  };
}

const criticalSound = (cue: GameSound) => cue === "defeat" || cue === "victory";
const noticeSound = (cue: GameSound) =>
  ["complete", "focusComplete", "buildComplete", "recruitComplete"].includes(
    cue,
  );

/** Wall-clock gate: accelerating the campaign never accelerates sound playback. */
export class SoundGate {
  private last = new Map<GameSound, number>();
  private recent: number[] = [];
  private notices: number[] = [];
  private lastCritical = -Infinity;
  private lastBattle = -Infinity;
  allow(
    cue: GameSound,
    now: number,
    settings: GameAudioSettings,
    visible: boolean,
    paused: boolean,
  ) {
    if (
      !settings.enabled ||
      settings.volume <= 0 ||
      !visible ||
      (isBattleSound(cue) ? !settings.battle || paused : !settings.effects)
    )
      return false;
    const interval =
      cue === "typewriter"
        ? 75
        : isBattleSound(cue)
          ? 850
          : cue === "click"
            ? 110
            : 300;
    if (now - (this.last.get(cue) ?? -Infinity) < interval) return false;
    if (isBattleSound(cue) && now - this.lastBattle < 800) return false;
    this.recent = this.recent.filter((at) => now - at < 1000);
    this.notices = this.notices.filter((at) => now - at < 1000);
    if (criticalSound(cue)) {
      if (now - this.lastCritical < 500) return false;
      this.lastCritical = now;
    } else if (noticeSound(cue)) {
      if (this.notices.length >= 2) return false;
      this.notices.push(now);
    } else if (cue !== "typewriter" && this.recent.length >= 6) return false;
    this.last.set(cue, now);
    if (isBattleSound(cue)) this.lastBattle = now;
    if (cue !== "typewriter" && !criticalSound(cue) && !noticeSound(cue))
      this.recent.push(now);
    return true;
  }
  reset() {
    this.last.clear();
    this.recent = [];
    this.notices = [];
    this.lastCritical = -Infinity;
    this.lastBattle = -Infinity;
  }
}

export function actionSound(action: Action): GameSound {
  switch (action.type) {
    case "move":
    case "moveGroup":
    case "commanderDeploy":
      return "order";
    case "front":
    case "offensive":
      return "plan";
    case "plan":
      return action.kind === "start"
        ? "assault"
        : action.kind === "pause"
          ? "halt"
          : "cancel";
    case "commanderStance":
      return action.stance === "attack" ? "assault" : "defend";
    case "commanderCreate":
    case "general":
      return "commander";
    case "paradrop":
    case "wing":
    case "air":
      return "airOrder";
    case "ship":
    case "navy":
    case "carrierAircraft":
      return "navalOrder";
    case "halt":
    case "haltGroup":
    case "commanderRecall":
      return "halt";
    case "research":
      return "research";
    case "focus":
      return "focus";
    case "historicalChoice":
      return action.choice === "accept"
        ? "historicalAccept"
        : "historicalDecline";
    case "build":
      return ["rail", "hub", "infra"].includes(action.building)
        ? "railBuild"
        : "build";
    case "production":
      return "production";
    case "recruit":
      return "recruit";
    case "createWing":
      return "wingReady";
    case "commission":
      return "commission";
    case "cancelBuild":
    case "cancelTrade":
    case "deleteFront":
    case "disbandWing":
      return "cancel";
    case "trade":
      return "trade";
    case "diplomacy":
      switch (action.kind) {
        case "war":
          return "warDeclaration";
        case "alliance":
          return "alliance";
        case "pact":
          return "pact";
        case "embargo":
          return "embargo";
        case "aid":
          return "aid";
        case "peace":
          return "peace";
        case "liberate":
          return "liberation";
        default:
          return "diplomacy";
      }
    case "peaceClaim":
    case "peacePass":
      return "peace";
    case "release":
      return "liberation";
    case "agency":
      return "intelligence";
    case "trainAgent":
      return "agentReady";
    case "counterIntel":
      return "counterIntel";
    case "mission":
      return action.mission === "sabotage" ? "sabotage" : "intelligence";
    case "support":
      return "support";
    case "economy":
    case "conscription":
    case "advisor":
    case "cabinet":
    case "occupation":
      return "policy";
    case "decision":
    case "reform":
      return "decision";
    default:
      return "click";
  }
}

/** Emit completions from state transitions, never from translated notification text. */
export function worldSounds(previous: World | null, next: World): GameSound[] {
  if (
    !previous ||
    previous === next ||
    previous.player !== next.player ||
    next.day * 24 + next.hour < previous.day * 24 + previous.hour
  )
    return [];
  const before = previous.countries[previous.player],
    after = next.countries[next.player];
  if (!before || !after) return [];
  if (!before.capitulated && after.capitulated) return ["defeat"];
  if (after.capitulated) return [];
  const sounds: GameSound[] = [];
  if (
    before.wars.some(
      (id) =>
        next.countries[id]?.capitulated && !previous.countries[id]?.capitulated,
    )
  )
    sounds.push("victory");
  if (after.tech.some((id) => !before.tech.includes(id)))
    sounds.push("complete");
  if (after.focuses.some((id) => !before.focuses.includes(id)))
    sounds.push("focusComplete");
  if (after.wars.some((id) => !before.wars.includes(id)))
    sounds.push("warDeclaration");
  if (
    Object.values(next.provinces).some(
      (p) =>
        p.controller === next.player &&
        previous.provinces[p.id]?.controller !== next.player,
    )
  )
    sounds.push("capture");
  if (
    before.construction.some((project) => {
      const old = previous.provinces[project.province],
        current = next.provinces[project.province];
      return (
        old &&
        current &&
        current.controller === next.player &&
        current.buildings[project.building] > old.buildings[project.building]
      );
    })
  )
    sounds.push("buildComplete");
  if (before.recruitment.length) {
    const oldArmies = new Set(
      previous.armies.filter((a) => a.country === next.player).map((a) => a.id),
    );
    if (
      next.armies.some((a) => a.country === next.player && !oldArmies.has(a.id))
    )
      sounds.push("recruitComplete");
  }
  const report = next.airNavalReports?.find((r) => r.country === next.player);
  const oldReport = previous.airNavalReports?.find(
    (r) => r.country === next.player,
  );
  if (report && report.day !== oldReport?.day) {
    if (report.air.bombingDamage > 0) sounds.push("bombing");
    else if (report.air.engagements > 0 || report.air.navalDamage > 0)
      sounds.push("aircraft");
    if (report.navy.engagements > 0) sounds.push("naval");
  }
  // A single simulation checkpoint can finish hundreds of things. Keep the important two.
  return [...new Set(sounds)].slice(0, 2);
}

/** One quiet representative effect for the player's actual ongoing battle/march. */
export function battlefieldSound(
  world: World,
  sample: number,
): GameSound | null {
  if (world.countries[world.player]?.capitulated) return null;
  const battles = world.battles.filter(
    (b) => b.attacker === world.player || b.defender === world.player,
  );
  if (battles.length) {
    const battle = battles[sample % battles.length];
    const army = world.armies.find(
      (a) =>
        a.country === world.player &&
        (a.province === battle.province || a.move?.to === battle.province),
    );
    return army?.type === "artillery"
      ? "artillery"
      : army?.type.includes("Tank")
        ? "armor"
        : "rifle";
  }
  const moving = world.armies.find((a) => a.country === world.player && a.move);
  if (!moving) return null;
  return moving.type.includes("Tank") ||
    ["motorized", "mechanized"].includes(moving.type)
    ? "engine"
    : "footstep";
}

type Part = {
  kind: "tone" | "noise";
  frequency: number;
  end?: number;
  duration: number;
  gain: number;
  delay?: number;
  wave?: OscillatorType;
};
const tone = (
  frequency: number,
  end: number,
  duration: number,
  gain: number,
  delay = 0,
  wave: OscillatorType = "sine",
): Part => ({ kind: "tone", frequency, end, duration, gain, delay, wave });
const noise = (
  frequency: number,
  duration: number,
  gain: number,
  delay = 0,
): Part => ({ kind: "noise", frequency, duration, gain, delay });
const chime = (notes: number[], gain = 0.11): Part[] =>
  notes.map((n, i) => tone(n, n, 0.24, gain, i * 0.12, "triangle"));
/** Original synthesized motifs, including mechanical keys and distant weapons. */
export function soundPattern(cue: GameSound): readonly Part[] {
  switch (cue) {
    case "warDeclaration":
      return [
        tone(210, 95, 0.5, 0.13, 0, "sawtooth"),
        noise(750, 0.3, 0.07, 0.1),
      ];
    case "alliance":
      return chime([330, 415, 494, 660], 0.09);
    case "pact":
      return [noise(900, 0.08, 0.08), ...chime([294, 440], 0.08)];
    case "trade":
      return [
        tone(1300, 1300, 0.1, 0.045),
        tone(1700, 1700, 0.12, 0.04, 0.08),
        noise(1800, 0.06, 0.04, 0.19),
      ];
    case "embargo":
      return [
        tone(370, 185, 0.24, 0.08, 0, "triangle"),
        noise(550, 0.08, 0.075, 0.15),
      ];
    case "aid":
      return chime([392, 494, 587], 0.08);
    case "peace":
      return chime([262, 392, 523, 784], 0.075);
    case "liberation":
      return chime([294, 370, 440, 587], 0.085);
    case "commander":
      return [noise(1900, 0.045, 0.06), ...chime([196, 294, 392], 0.085)];
    case "defend":
      return [tone(280, 280, 0.12, 0.075), tone(210, 210, 0.2, 0.075, 0.17)];
    case "assault":
      return [
        tone(294, 392, 0.15, 0.095, 0, "triangle"),
        tone(440, 587, 0.19, 0.085, 0.17, "triangle"),
      ];
    case "plan":
      return [
        noise(2100, 0.09, 0.045),
        noise(1300, 0.1, 0.04, 0.13),
        tone(520, 520, 0.1, 0.055, 0.24),
      ];
    case "airOrder":
      return [tone(720, 1050, 0.16, 0.06), tone(850, 650, 0.13, 0.045, 0.2)];
    case "navalOrder":
      return [
        tone(140, 140, 0.3, 0.085, 0, "triangle"),
        tone(210, 210, 0.18, 0.06, 0.33),
      ];
    case "commission":
      return [
        tone(110, 165, 0.45, 0.09, 0, "triangle"),
        ...chime([330, 440], 0.07),
      ];
    case "wingReady":
      return [
        tone(120, 240, 0.3, 0.045, 0, "sawtooth"),
        ...chime([523, 784], 0.07),
      ];
    case "intelligence":
      return [
        tone(850, 850, 0.055, 0.055),
        tone(850, 850, 0.055, 0.055, 0.12),
        tone(850, 850, 0.17, 0.055, 0.24),
      ];
    case "agentReady":
      return [noise(1800, 0.05, 0.035), ...chime([247, 370], 0.06)];
    case "counterIntel":
      return [tone(740, 370, 0.12, 0.07), tone(740, 370, 0.12, 0.07, 0.18)];
    case "sabotage":
      return [
        noise(2700, 0.08, 0.075),
        tone(150, 40, 0.25, 0.08),
        noise(400, 0.25, 0.055, 0.1),
      ];
    case "railBuild":
      return [
        noise(2800, 0.06, 0.06),
        tone(520, 350, 0.1, 0.045),
        noise(2400, 0.06, 0.06, 0.2),
        tone(520, 350, 0.1, 0.045, 0.2),
      ];
    case "production":
      return [
        tone(80, 110, 0.3, 0.055, 0, "triangle"),
        noise(1400, 0.045, 0.04, 0.03),
        noise(1700, 0.045, 0.04, 0.18),
      ];
    case "policy":
      return [noise(1000, 0.13, 0.05), tone(260, 130, 0.13, 0.055, 0.14)];
    case "cancel":
      return [tone(500, 300, 0.1, 0.06), noise(1000, 0.04, 0.035, 0.11)];
    case "focusComplete":
      return [noise(800, 0.09, 0.07), ...chime([330, 440, 554, 660], 0.08)];
    case "buildComplete":
      return [noise(2100, 0.07, 0.07), ...chime([349, 440, 523], 0.075)];
    case "recruitComplete":
      return chime([196, 262, 330, 392], 0.085);
    case "historicalAccept":
      return [
        noise(700, 0.1, 0.085),
        tone(170, 85, 0.15, 0.075),
        ...chime([392, 523], 0.065),
      ];
    case "historicalDecline":
      return [noise(1500, 0.14, 0.055), tone(330, 220, 0.18, 0.065, 0.12)];
    case "bombing":
      return [
        noise(950, 0.18, 0.11),
        tone(80, 26, 0.65, 0.12),
        noise(290, 0.65, 0.09, 0.08),
        noise(1100, 0.13, 0.07, 0.36),
      ];
    case "support":
      return [
        noise(2300, 0.05, 0.05),
        noise(1900, 0.07, 0.06, 0.12),
        tone(310, 420, 0.13, 0.055, 0.2),
      ];
    case "typewriter":
      return [noise(2600, 0.025, 0.09), tone(650, 210, 0.035, 0.025)];
    case "click":
      return [tone(620, 470, 0.055, 0.06)];
    case "start":
      return chime([220, 330, 440, 660]);
    case "save":
      return chime([620, 830], 0.08);
    case "load":
      return chime([390, 520], 0.08);
    case "error":
      return [tone(160, 110, 0.18, 0.1, 0, "triangle")];
    case "order":
      return [noise(1600, 0.055, 0.05), ...chime([380, 570], 0.075)];
    case "halt":
      return chime([440, 330], 0.075);
    case "research":
      return chime([440, 550], 0.07);
    case "complete":
      return chime([440, 554, 660, 880]);
    case "focus":
      return [noise(2100, 0.04, 0.07), ...chime([330, 440, 550], 0.09)];
    case "diplomacy":
      return chime([350, 440, 525], 0.075);
    case "decision":
      return [noise(750, 0.1, 0.08), tone(180, 90, 0.14, 0.08)];
    case "build":
      return [
        noise(1900, 0.06, 0.09),
        tone(280, 220, 0.13, 0.06),
        noise(1500, 0.07, 0.06, 0.17),
      ];
    case "recruit":
      return chime([262, 330, 392], 0.085);
    case "capture":
      return chime([330, 440, 660], 0.09);
    case "victory":
      return chime([262, 330, 392, 523, 659]);
    case "defeat":
      return chime([330, 294, 247, 165], 0.12);
    case "rifle":
      return [
        noise(2500, 0.045, 0.13),
        tone(150, 60, 0.14, 0.07),
        noise(900, 0.1, 0.045, 0.18),
      ];
    case "artillery":
      return [
        noise(1500, 0.09, 0.17),
        noise(260, 0.65, 0.12, 0.02),
        tone(85, 28, 0.5, 0.15),
      ];
    case "armor":
      return [
        noise(1200, 0.08, 0.13),
        tone(100, 33, 0.32, 0.13),
        noise(480, 0.34, 0.08, 0.04),
      ];
    case "footstep":
      return [
        noise(450, 0.1, 0.055),
        tone(95, 55, 0.08, 0.035),
        noise(520, 0.09, 0.045, 0.24),
      ];
    case "engine":
      return [tone(65, 82, 0.55, 0.045, 0, "triangle"), noise(350, 0.5, 0.035)];
    case "aircraft":
      return [
        tone(180, 85, 0.65, 0.055, 0, "sawtooth"),
        noise(800, 0.55, 0.05),
      ];
    case "naval":
      return [
        tone(90, 34, 0.5, 0.12),
        noise(650, 0.55, 0.12),
        noise(1600, 0.09, 0.08),
      ];
  }
}

export const AUDIO_MAX_VOICES = 18;
/** One lazy context and one shared noise buffer for the entire campaign, zero external assets. */
export function createGameAudio(createContext?: () => AudioContext) {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let noiseBuffer: AudioBuffer | null = null;
  let settings = { ...DEFAULT_AUDIO };
  let visible = true,
    paused = true,
    disposed = false;
  const gate = new SoundGate();
  const sources = new Map<
    AudioScheduledSourceNode,
    { nodes: AudioNode[]; cue: GameSound }
  >();
  const clear = (battleOnly = false, ordinaryOnly = false) => {
    for (const [source, entry] of sources) {
      if (battleOnly && !isBattleSound(entry.cue)) continue;
      if (ordinaryOnly && (criticalSound(entry.cue) || noticeSound(entry.cue)))
        continue;
      source.onended = null;
      try {
        source.stop();
      } catch {
        /* Already ended. */
      }
      source.disconnect();
      for (const node of entry.nodes) node.disconnect();
      sources.delete(source);
    }
  };
  function applyVolume() {
    if (master && context)
      master.gain.setValueAtTime(
        settings.enabled && visible ? settings.volume : 0,
        context.currentTime,
      );
  }
  return {
    /** Call only from a trusted pointer/keyboard gesture. No deferred sound queue. */
    unlock() {
      if (disposed || !settings.enabled || !visible) return false;
      try {
        if (!context) {
          const Constructor =
            typeof window !== "undefined"
              ? (window.AudioContext ??
                (
                  window as unknown as {
                    webkitAudioContext?: typeof AudioContext;
                  }
                ).webkitAudioContext)
              : undefined;
          if (!createContext && !Constructor) return false;
          context = createContext
            ? createContext()
            : new Constructor!({ latencyHint: "interactive" });
          master = context.createGain();
          master.connect(context.destination);
          noiseBuffer = context.createBuffer(
            1,
            Math.ceil(context.sampleRate * 0.8),
            context.sampleRate,
          );
          const channel = noiseBuffer.getChannelData(0);
          // Local presentation noise only, never draws from the game RNG.
          for (let i = 0; i < channel.length; i++)
            channel[i] = Math.random() * 2 - 1;
          applyVolume();
        }
        if (context.state === "suspended")
          void context.resume().catch(() => undefined);
        return context.state === "running";
      } catch {
        return false;
      }
    },
    play(
      cue: GameSound,
      now = typeof performance !== "undefined" ? performance.now() : Date.now(),
    ) {
      if (
        disposed ||
        !context ||
        context.state !== "running" ||
        !master ||
        !noiseBuffer ||
        !gate.allow(cue, now, settings, visible, paused)
      )
        return false;
      const pattern = soundPattern(cue);
      if (criticalSound(cue)) clear();
      else if (
        noticeSound(cue) &&
        sources.size + pattern.length > AUDIO_MAX_VOICES
      )
        clear(false, true);
      if (sources.size >= AUDIO_MAX_VOICES) return false;
      for (const part of pattern) {
        if (sources.size >= AUDIO_MAX_VOICES) break;
        const at = context.currentTime + (part.delay ?? 0),
          envelope = context.createGain();
        envelope.gain.setValueAtTime(0.0001, at);
        envelope.gain.exponentialRampToValueAtTime(part.gain, at + 0.003);
        envelope.gain.exponentialRampToValueAtTime(0.0001, at + part.duration);
        let source: AudioScheduledSourceNode;
        const nodes: AudioNode[] = [envelope];
        if (part.kind === "tone") {
          const oscillator = context.createOscillator();
          oscillator.type = part.wave ?? "sine";
          oscillator.frequency.setValueAtTime(part.frequency, at);
          oscillator.frequency.exponentialRampToValueAtTime(
            part.end ?? part.frequency,
            at + part.duration,
          );
          oscillator.connect(envelope);
          source = oscillator;
        } else {
          const bufferSource = context.createBufferSource(),
            filter = context.createBiquadFilter();
          bufferSource.buffer = noiseBuffer;
          filter.type = "lowpass";
          filter.frequency.value = part.frequency;
          filter.Q.value = 0.7;
          bufferSource.connect(filter).connect(envelope);
          nodes.push(filter);
          source = bufferSource;
        }
        envelope.connect(master);
        sources.set(source, { nodes, cue });
        source.onended = () => {
          source.disconnect();
          for (const node of nodes) node.disconnect();
          sources.delete(source);
        };
        source.start(at);
        source.stop(at + part.duration + 0.015);
      }
      return true;
    },
    setSettings(next: GameAudioSettings) {
      const old = settings;
      settings = audioSettings(next);
      if (
        !settings.enabled ||
        settings.volume <= 0 ||
        (old.effects && !settings.effects)
      )
        clear();
      else if (old.battle && !settings.battle) clear(true);
      applyVolume();
    },
    setActivity(nextVisible: boolean, nextPaused: boolean) {
      visible = nextVisible;
      paused = nextPaused;
      if (!visible) clear();
      else if (paused) clear(true);
      applyVolume();
    },
    reset() {
      clear(true);
      gate.reset();
    },
    stats() {
      return {
        activeVoices: sources.size,
        contextCreated: context !== null,
        running: context?.state === "running",
      };
    },
    dispose() {
      disposed = true;
      clear();
      master?.disconnect();
      if (context && context.state !== "closed")
        void context.close().catch(() => undefined);
      context = null;
      master = null;
      noiseBuffer = null;
    },
  };
}

export interface VoiceStatus {
  available: boolean;
  reason: string;
}
/** A browser's remote voices are deliberately excluded, even if they are default. */
export function localTurkishVoice(voices: readonly SpeechSynthesisVoice[]) {
  const local = voices.filter(
    (voice) => voice.localService === true && /^tr(?:[-_]|$)/i.test(voice.lang),
  );
  return local.find((voice) => voice.default) ?? local[0] ?? null;
}
export function spokenAction(action: Action, world: World | null): string {
  const target =
    "target" in action && typeof action.target === "string"
      ? world?.countries[action.target]?.name
      : undefined;
  const messages: Partial<Record<GameSound, string>> = {
    order: "Birliklere hareket emri verildi.",
    halt: "Birliklere dur emri verildi.",
    research: "Yeni araştırma başlatıldı.",
    focus: "Ulusal odak hazırlığı başladı.",
    warDeclaration: target
      ? `${target} ile savaş başladı.`
      : "Savaş ilan edildi.",
    alliance: "İttifak anlaşması kuruldu.",
    pact: "Saldırmazlık paktı imzalandı.",
    trade: "Kaynak ticareti başlatıldı.",
    embargo: "Ambargo kararı uygulandı.",
    aid: "Yardım emri uygulandı.",
    peace: "Barış görüşmesi kararı uygulandı.",
    liberation: "Bağımsızlık kararı uygulandı.",
    commander: "Komutan ataması tamamlandı.",
    defend: "Komutan savunmaya geçti.",
    assault: "Taarruz emri verildi.",
    plan: "Harekât planı hazırlandı.",
    airOrder: "Hava kuvvetleri emri uygulandı.",
    navalOrder: "Donanma emri uygulandı.",
    commission: "Gemi hizmete alındı.",
    wingReady: "Hava kanadı göreve hazır.",
    intelligence: "İstihbarat emri uygulandı.",
    agentReady: "Ajan eğitimi başlatıldı.",
    counterIntel: "Karşı istihbarat ayarı değiştirildi.",
    sabotage: "Sabotaj operasyonu başlatıldı.",
    railBuild: "Ulaştırma inşaatı sıraya alındı.",
    production: "Üretim hattı güncellendi.",
    policy: "Yönetim kararı uygulandı.",
    cancel: "İşlem iptal edildi.",
    build: "İnşaat sıraya alındı.",
    recruit: "Tümen eğitimi başladı.",
    historicalAccept: "Tarihî olay kararı onaylandı.",
    historicalDecline: "Tarihî olay önerisi reddedildi.",
    support: "Tümen destek bölüğü güncellendi.",
    diplomacy: "Diplomatik işlem uygulandı.",
    decision: "Ulusal karar uygulandı.",
  };
  return messages[actionSound(action)] ?? "";
}
export function spokenNotification(cue: GameSound): string {
  const messages: Partial<Record<GameSound, string>> = {
    complete: "Araştırma tamamlandı. Yeni teknoloji kullanıma hazır.",
    focusComplete: "Ulusal odak tamamlandı.",
    buildComplete: "İnşaat tamamlandı.",
    recruitComplete: "Yeni tümen göreve hazır.",
    capture: "Yeni bir bölge ele geçirildi.",
    defeat: "Ülken teslim oldu. Sefer sona erdi.",
    victory: "Düşman ülke teslim oldu.",
    warDeclaration: "Ülken yeni bir savaşa girdi.",
  };
  return messages[cue] ?? "";
}

/** Optional, opt-in speech. Nothing is queued; hidden/muted/load states cancel immediately. */
export function createLocalSpeech(dependencies: {
  synthesis: SpeechSynthesis | null;
  utterance: (text: string) => SpeechSynthesisUtterance;
}) {
  const synthesis = dependencies.synthesis;
  let settings = { ...DEFAULT_AUDIO },
    visible = true,
    unlocked = false,
    disposed = false;
  let lastAt = -Infinity,
    lastText = "",
    lastTextAt = -Infinity;
  let active: SpeechSynthesisUtterance | null = null;
  function stop() {
    if (active) {
      active.onend = null;
      active.onerror = null;
      synthesis?.cancel();
      active = null;
    }
  }
  return {
    status(): VoiceStatus {
      if (!synthesis)
        return {
          available: false,
          reason: "Bu tarayıcı konuşmalı bildirimleri desteklemiyor.",
        };
      const voice = localTurkishVoice(synthesis.getVoices());
      return voice
        ? {
            available: true,
            reason: `Cihazındaki Türkçe ses: ${voice.name}. İnternet gerekmez.`,
          }
        : {
            available: false,
            reason:
              "Cihazında çevrimdışı Türkçe ses bulunamadı. Türkçe ses paketi eklediğinde bu seçenek açılır.",
          };
    },
    unlock() {
      if (!disposed) unlocked = true;
    },
    setSettings(next: GameAudioSettings) {
      settings = audioSettings(next);
      if (!settings.enabled || !settings.voice || settings.volume <= 0) stop();
    },
    setVisible(next: boolean) {
      visible = next;
      if (!visible) stop();
    },
    speak(
      message: string,
      now = typeof performance !== "undefined" ? performance.now() : Date.now(),
      urgent = false,
    ) {
      if (
        disposed ||
        !unlocked ||
        !visible ||
        !settings.enabled ||
        !settings.voice ||
        settings.volume <= 0 ||
        !synthesis
      )
        return false;
      const text = message.replace(/\s+/g, " ").trim().slice(0, 200);
      const voice = localTurkishVoice(synthesis.getVoices());
      if (
        !text ||
        !voice ||
        (!urgent && now - lastAt < 1600) ||
        (text === lastText && now - lastTextAt < 15000)
      )
        return false;
      if (urgent) stop();
      // Do not overlap or append to another message (including another site's widget).
      if (active || synthesis.speaking || synthesis.pending) return false;
      const utterance = dependencies.utterance(text);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.volume = settings.volume;
      utterance.rate = 1.04;
      utterance.pitch = 0.95;
      const finish = () => {
        if (active === utterance) active = null;
      };
      utterance.onend = finish;
      utterance.onerror = finish;
      active = utterance;
      lastAt = now;
      lastText = text;
      lastTextAt = now;
      try {
        synthesis.speak(utterance);
        return true;
      } catch {
        active = null;
        return false;
      }
    },
    reset() {
      stop();
      lastAt = -Infinity;
      lastText = "";
      lastTextAt = -Infinity;
    },
    dispose() {
      stop();
      disposed = true;
    },
  };
}
