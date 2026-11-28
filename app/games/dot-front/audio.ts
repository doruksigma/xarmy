import { DEFAULT_SOUND_MIX } from "./audio-types";
import type { SoundMix } from "./audio-types";
import type { Kind } from "./config";

export type { SoundMix } from "./audio-types";
export type SpatialSound = { pan: number; distance: number };
export type ShotSound = SpatialSound & { kind: Kind };

const FILES = {
  ambience: "ambience.mp3", light: "light-shot.mp3", light2: "light-shot-2.mp3",
  heavy: "heavy-shot.mp3", heavy2: "heavy-shot-2.mp3", impact: "impact.mp3",
} as const;
type Sample = keyof typeof FILES;
const MAX_VOICES = 12;
const encoded = new Map<string, Promise<ArrayBuffer>>();
type CachedBuffer = { context: AudioContext; promise: Promise<AudioBuffer>; ready?: AudioBuffer };
const decoded = new Map<string, CachedBuffer>();
const waiting = new Set<() => void>();
type Hub = {
  context: AudioContext; owners: Set<object>; active: Set<object>; primed: boolean;
  idle?: ReturnType<typeof setTimeout>; closing?: ReturnType<typeof setTimeout>; resuming?: Promise<void>;
};
let shared: Hub | undefined;
const hidden = () => typeof document !== "undefined" && document.hidden;

function suspendIdle(hub: Hub) {
  if (!hub.active.size && !hub.primed && hub.context.state !== "closed") {
    try { void hub.context.suspend().catch(() => {}); } catch { /* Audio is optional. */ }
  }
}
function resume(hub: Hub): Promise<void> {
  if (hub.context.state === "running") return Promise.resolve();
  if (hub.resuming) return hub.resuming;
  try {
    const task = hub.context.resume().catch(() => {}).then(() => {
      if (hub.resuming === task) hub.resuming = undefined;
      suspendIdle(hub);
    });
    hub.resuming = task;
    return task;
  } catch { return Promise.resolve(); }
}

/** Call synchronously in a real pointer/keyboard gesture. Mounting a game,
 * restoring settings or opening a lobby never creates an AudioContext. */
export function unlockAudio(): void {
  if (typeof window === "undefined" || hidden()) return;
  const Audio = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Audio) return;
  try {
    if (!shared || shared.context.state === "closed") shared = {
      context: new Audio(), owners: new Set(), active: new Set(), primed: false,
    };
    const hub = shared;
    if (hub.closing) clearTimeout(hub.closing);
    if (hub.idle) clearTimeout(hub.idle);
    hub.closing = undefined;
    hub.primed = true;
    // Resume before any await/network work, preserving the browser's gesture.
    void resume(hub);
    hub.idle = setTimeout(() => { hub.primed = false; suspendIdle(hub); }, 1000);
    for (const activate of waiting) activate();
  } catch { /* Missing/blocked audio must never block a match. */ }
}

function buffer(context: AudioContext, url: string): Promise<AudioBuffer | null> {
  const key = `${context.sampleRate}:${url}`;
  let entry = decoded.get(key);
  // A successful AudioBuffer is portable between contexts. A still-pending
  // decode owned by a closed context is not: retry it with the new owner while
  // keeping the globally shared encoded download.
  if (entry && !entry.ready && entry.context.state === "closed") entry = undefined;
  if (!entry) {
    let bytes = encoded.get(url);
    if (!bytes) {
      bytes = fetch(url, { credentials: "same-origin" }).then(response => {
        if (!response.ok) throw new Error("Audio asset unavailable");
        return response.arrayBuffer();
      });
      encoded.set(url, bytes);
      void bytes.catch(() => { if (encoded.get(url) === bytes) encoded.delete(url); });
    }
    const current: CachedBuffer = { context, promise: bytes.then(data => context.decodeAudioData(data.slice(0))) };
    entry = current;
    decoded.set(key, current);
    void current.promise.then(value => { current.ready = value; }, () => {
      if (decoded.get(key) === current) decoded.delete(key);
    });
  }
  return entry.promise.catch(() => null);
}

const volume = (value: number | undefined, previous: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : previous;
function smooth(parameter: AudioParam, value: number, now: number) {
  parameter.cancelScheduledValues(now);
  parameter.setTargetAtTime(value, now, 0.025);
}

/** Local samples only. An alternate relative asset base supports a subfolder
 * integration; cross-origin bases are deliberately refused. */
export function soundEffects(assetBase = "/dot-front/audio/") {
  const owner = {};
  let hub: Hub | undefined;
  let master: GainNode | undefined, ambienceGain: GainNode | undefined, effectsGain: GainNode | undefined;
  let compressor: DynamicsCompressorNode | undefined;
  let mix: SoundMix = { ...DEFAULT_SOUND_MIX };
  let desired = false, disposed = false, generation = 0;
  let starting: Promise<void> | undefined;
  let loop: AudioBufferSourceNode | undefined;
  const samples: Partial<Record<Sample, AudioBuffer>> = {};
  const voices = new Map<AudioBufferSourceNode, AudioNode[]>();
  const lastShot: Record<Kind, number> = { light: -Infinity, heavy: -Infinity, artillery: -Infinity, aircraft: -Infinity };
  let lastImpact = -Infinity;
  let serial = 0, lightVariant = 0, heavyVariant = 0;

  function ready() {
    return desired && !disposed && !hidden() && mix.masterVolume > 0 && hub?.context.state === "running";
  }
  function remove(source: AudioBufferSourceNode) {
    const nodes = voices.get(source);
    if (!nodes) return;
    voices.delete(source);
    source.onended = null;
    for (const node of nodes) { try { node.disconnect(); } catch { /* Already released. */ } }
    if (loop === source) loop = undefined;
  }
  function silence() {
    for (const source of [...voices.keys()]) {
      source.onended = null;
      try { source.stop(); } catch { /* Already ended. */ }
      remove(source);
    }
    for (const kind of Object.keys(lastShot) as Kind[]) lastShot[kind] = -Infinity;
    lastImpact = -Infinity;
  }
  function setMix() {
    if (!hub || !master || !ambienceGain || !effectsGain) return;
    const now = hub.context.currentTime;
    smooth(master.gain, mix.masterVolume, now);
    smooth(ambienceGain.gain, mix.ambienceVolume * 0.56, now);
    smooth(effectsGain.gain, mix.effectsVolume, now);
  }
  function graph() {
    if (!hub || master) return;
    const context = hub.context;
    master = context.createGain();
    ambienceGain = context.createGain();
    effectsGain = context.createGain();
    compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 12;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.18;
    master.gain.value = 0;
    ambienceGain.connect(compressor);
    effectsGain.connect(compressor);
    compressor.connect(master);
    master.connect(context.destination);
    setMix();
  }
  function ambience() {
    if (!ready() || !hub || !ambienceGain || !samples.ambience || loop || mix.ambienceVolume <= 0) return;
    try {
      if (voices.size >= MAX_VOICES) {
        const oldest = voices.keys().next().value;
        if (oldest) { try { oldest.stop(); } catch { /* Already ended. */ } remove(oldest); }
      }
      const source = hub.context.createBufferSource();
      source.buffer = samples.ambience;
      source.loop = true;
      // Cyclic guards avoid MP3 encoder padding at either end of the file.
      source.loopStart = 1;
      source.loopEnd = 25;
      source.connect(ambienceGain);
      voices.set(source, [source]);
      source.onended = () => remove(source);
      loop = source;
      source.start(0, 1);
    } catch { if (loop) remove(loop); }
  }
  function deactivate() {
    if (!hub) return;
    hub.active.delete(owner);
    hub.primed = false;
    suspendIdle(hub);
  }
  function allowed(token: number) {
    return token === generation && desired && !disposed && !hidden() && mix.masterVolume > 0;
  }
  function activate(): Promise<void> {
    if (!desired || disposed || hidden() || mix.masterVolume <= 0 || !shared || shared.context.state === "closed") return Promise.resolve();
    if (starting) return starting;
    if (!hub) {
      hub = shared;
      if (hub.closing) clearTimeout(hub.closing);
      hub.closing = undefined;
      hub.owners.add(owner);
      graph();
    }
    const currentHub = hub, token = generation;
    currentHub.active.add(owner);
    const task = (async () => {
      try {
        // Loading and gesture-unlocked resuming run together. Missed combat
        // sounds are never queued while either operation is pending.
        const location = window.location.href;
        const base = new URL(assetBase.endsWith("/") ? assetBase : `${assetBase}/`, typeof document !== "undefined" ? document.baseURI || location : location);
        if (base.origin !== new URL(location).origin) { deactivate(); return; }
        await Promise.all([
          resume(currentHub),
          ...Object.entries(FILES).map(async ([name, file]) => {
            const sample = await buffer(currentHub.context, new URL(file, base).href);
            if (sample) samples[name as Sample] = sample;
          }),
        ]);
        if (allowed(token)) ambience();
        else if (!desired || disposed || hidden() || mix.masterVolume <= 0) deactivate();
      } catch { /* Fetch, decode and browser audio failures are nonfatal. */ }
    })().finally(() => { if (starting === task) starting = undefined; });
    starting = task;
    return task;
  }
  const onUnlock = () => { void activate(); };
  async function enable() {
    if (disposed || hidden()) return;
    desired = true;
    waiting.add(onUnlock);
    await activate();
  }
  function stop() {
    desired = false;
    generation++;
    starting = undefined;
    waiting.delete(onUnlock);
    silence();
    deactivate();
  }
  function spatial(sample: AudioBuffer, position: SpatialSound, amplitude: number, pitch = 1) {
    if (!ready() || !hub || !effectsGain || mix.effectsVolume <= 0 || voices.size >= MAX_VOICES) return;
    const distance = Number.isFinite(position.distance) ? Math.max(0, Math.min(1, position.distance)) : 1;
    if (distance >= 1) return;
    let source: AudioBufferSourceNode | undefined;
    try {
      const context = hub.context, gain = context.createGain();
      source = context.createBufferSource();
      source.buffer = sample;
      source.playbackRate.value = pitch * (0.97 + (serial++ % 5) * 0.015);
      gain.gain.value = amplitude * (1 - distance) ** 2;
      const nodes: AudioNode[] = [source, gain];
      source.connect(gain);
      if (typeof context.createStereoPanner === "function") {
        const panner = context.createStereoPanner();
        panner.pan.value = Number.isFinite(position.pan) ? Math.max(-1, Math.min(1, position.pan)) : 0;
        gain.connect(panner);
        panner.connect(effectsGain);
        nodes.push(panner);
      } else gain.connect(effectsGain);
      voices.set(source, nodes);
      source.onended = () => { if (source) remove(source); };
      source.start();
    } catch { if (source) remove(source); }
  }
  function shot(position: ShotSound) {
    if (!ready() || !hub || mix.effectsVolume <= 0 || !Number.isFinite(position.distance) || position.distance >= 1) return;
    const now = hub.context.currentTime, heavy = position.kind !== "light";
    // Each weapon has its own gate: a nearby rifle must not mask a heavy shot
    // that happened during the same frame. The shared voice cap still applies.
    if (now - lastShot[position.kind] < (heavy ? 0.18 : 0.075)) return;
    const alternative = heavy ? heavyVariant++ % 2 : lightVariant++ % 2;
    const sample = heavy ? (alternative ? samples.heavy2 ?? samples.heavy : samples.heavy ?? samples.heavy2)
      : (alternative ? samples.light2 ?? samples.light : samples.light ?? samples.light2);
    if (!sample) return;
    lastShot[position.kind] = now;
    const artillery = position.kind === "artillery", aircraft = position.kind === "aircraft";
    spatial(sample, position, artillery ? .7 : heavy ? .58 : .42, artillery ? .72 : aircraft ? .88 : 1);
  }
  function impact(position: SpatialSound) {
    if (!ready() || !hub || !samples.impact || mix.effectsVolume <= 0 || !Number.isFinite(position.distance) || position.distance >= 1) return;
    const now = hub.context.currentTime;
    if (now - lastImpact < 0.14) return;
    lastImpact = now;
    spatial(samples.impact, position, 0.3);
  }
  function configure(next: Partial<SoundMix>) {
    mix = {
      masterVolume: volume(next.masterVolume, mix.masterVolume),
      ambienceVolume: volume(next.ambienceVolume, mix.ambienceVolume),
      effectsVolume: volume(next.effectsVolume, mix.effectsVolume),
    };
    setMix();
    if (mix.masterVolume <= 0) {
      generation++;
      starting = undefined;
      silence();
      deactivate();
    } else if (desired) {
      if (mix.ambienceVolume <= 0 && loop) {
        const source = loop;
        try { source.stop(); } catch { /* Already ended. */ }
        remove(source);
      }
      if (mix.effectsVolume <= 0) for (const source of [...voices.keys()]) if (source !== loop) {
        try { source.stop(); } catch { /* Already ended. */ }
        remove(source);
      }
      void activate();
      ambience();
    }
  }
  const onHidden = () => { if (hidden()) stop(); };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onHidden);
  if (typeof window !== "undefined") window.addEventListener("pagehide", stop);
  function dispose() {
    if (disposed) return;
    stop();
    disposed = true;
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onHidden);
    if (typeof window !== "undefined") window.removeEventListener("pagehide", stop);
    for (const node of [master, ambienceGain, effectsGain, compressor]) { try { node?.disconnect(); } catch { /* Released. */ } }
    if (hub) {
      const released = hub;
      released.owners.delete(owner);
      if (!released.owners.size) released.closing = setTimeout(() => {
        if (released.owners.size || released.primed) return;
        if (released.idle) clearTimeout(released.idle);
        if (shared === released) shared = undefined;
        try { void released.context.close().catch(() => {}); } catch { /* Already closed. */ }
      }, 150);
    }
  }
  return { enable, stop, dispose, configure, shot, impact };
}
