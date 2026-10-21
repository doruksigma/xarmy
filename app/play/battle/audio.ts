import type { Surface, WeaponId, Weather } from "./types";

type WeaponSound = {
  bass: number;
  crack: number;
  body: number;
  length: number;
  gain: number;
};
const WEAPON_SOUND: Record<WeaponId, WeaponSound> = {
  ak47: { bass: 105, crack: 2400, body: 720, length: 0.24, gain: 0.65 },
  m4: { bass: 145, crack: 3300, body: 1050, length: 0.18, gain: 0.54 },
  smg: { bass: 195, crack: 3900, body: 1450, length: 0.12, gain: 0.4 },
  sniper: { bass: 62, crack: 2100, body: 450, length: 0.48, gain: 0.85 },
  shotgun: { bass: 73, crack: 1800, body: 550, length: 0.36, gain: 0.77 },
  pistol: { bass: 180, crack: 3000, body: 1250, length: 0.16, gain: 0.48 },
  lmg: { bass: 95, crack: 2600, body: 600, length: 0.26, gain: 0.66 },
};

const SURFACE_SOUND: Record<
  Surface,
  { frequency: number; body: number; ring: number }
> = {
  soil: { frequency: 650, body: 90, ring: 0 },
  stone: { frequency: 1700, body: 165, ring: 0 },
  metal: { frequency: 2300, body: 225, ring: 1250 },
  wood: { frequency: 1050, body: 145, ring: 440 },
  glass: { frequency: 5500, body: 300, ring: 2650 },
};

/** Original synthesized effects; no downloaded recordings or autoplay audio. */
export function createAudio() {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let bus: DynamicsCompressorNode | null = null;
  let noiseBuffer: AudioBuffer | null = null;
  let windGain: GainNode | null = null;
  let rainGain: GainNode | null = null;
  let volume = 0.45;
  let weather: Weather = "clear";
  let disposed = false;
  const sources = new Set<AudioScheduledSourceNode>();
  const transientSources = new Set<AudioScheduledSourceNode>();
  const transientNodes = new Map<AudioScheduledSourceNode, AudioNode[]>();
  const permanentNodes = new Set<AudioNode>();
  const MAX_VOICES = 48;

  function running() {
    return !disposed && context?.state === "running" && bus && noiseBuffer;
  }

  function attenuation(distance = 0) {
    const d = Math.max(0, Number.isFinite(distance) ? distance : 0);
    return d > 220 ? 0 : 1 / (1 + d * 0.045 + d * d * 0.0003);
  }

  function finish(source: AudioScheduledSourceNode, nodes: AudioNode[]) {
    sources.add(source);
    transientSources.add(source);
    transientNodes.set(source, nodes);
    source.onended = () => {
      source.disconnect();
      for (const node of nodes) node.disconnect();
      sources.delete(source);
      transientSources.delete(source);
      transientNodes.delete(source);
    };
  }

  function noise(
    frequency: number,
    length: number,
    gain: number,
    offset = 0,
    type: BiquadFilterType = "bandpass",
  ) {
    if (!running() || gain < 0.001 || transientSources.size >= MAX_VOICES)
      return;
    const ctx = context!;
    const at = ctx.currentTime + offset;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = 0.7;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(0.001, gain),
      at + 0.003,
    );
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + length);
    source.connect(filter).connect(envelope).connect(bus!);
    finish(source, [filter, envelope]);
    source.start(at, Math.random() * 0.5);
    source.stop(at + length + 0.015);
  }

  function tone(
    from: number,
    to: number,
    length: number,
    gain: number,
    offset = 0,
    type: OscillatorType = "sine",
  ) {
    if (!running() || gain < 0.001 || transientSources.size >= MAX_VOICES)
      return;
    const ctx = context!;
    const at = ctx.currentTime + offset;
    const source = ctx.createOscillator();
    source.type = type;
    source.frequency.setValueAtTime(from, at);
    source.frequency.exponentialRampToValueAtTime(
      Math.max(20, to),
      at + length,
    );
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(0.001, gain),
      at + 0.004,
    );
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + length);
    source.connect(envelope).connect(bus!);
    finish(source, [envelope]);
    source.start(at);
    source.stop(at + length + 0.015);
  }

  function ambientLoop(frequency: number, highpass: boolean) {
    const ctx = context!;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = highpass ? "highpass" : "lowpass";
    filter.frequency.value = frequency;
    filter.Q.value = 0.35;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(bus!);
    source.start();
    sources.add(source);
    permanentNodes.add(source);
    permanentNodes.add(filter);
    permanentNodes.add(gain);
    return gain;
  }

  function applyAmbient() {
    if (!context || !windGain || !rainGain || disposed) return;
    const at = context.currentTime;
    const wind =
      weather === "storm" ? 0.038 : weather === "rain" ? 0.022 : 0.012;
    const rain = weather === "storm" ? 0.028 : weather === "rain" ? 0.016 : 0;
    windGain.gain.setTargetAtTime(wind, at, 1.8);
    rainGain.gain.setTargetAtTime(rain, at, 1.8);
  }

  function unlock() {
    if (disposed) return;
    try {
      if (!context) {
        const Constructor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!Constructor) return;
        context = new Constructor({ latencyHint: "interactive" });
        master = context.createGain();
        master.gain.value = volume;
        bus = context.createDynamicsCompressor();
        bus.threshold.value = -14;
        bus.knee.value = 20;
        bus.ratio.value = 5;
        bus.attack.value = 0.003;
        bus.release.value = 0.18;
        bus.connect(master).connect(context.destination);
        permanentNodes.add(master);
        permanentNodes.add(bus);
        noiseBuffer = context.createBuffer(
          1,
          context.sampleRate * 2,
          context.sampleRate,
        );
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        windGain = ambientLoop(320, false);
        rainGain = ambientLoop(1900, true);
        applyAmbient();
      }
      if (context.state === "suspended")
        void context.resume().catch(() => undefined);
    } catch {
      // Playback remains usable when a browser blocks or lacks Web Audio.
    }
  }

  return {
    unlock,
    shot(weapon: WeaponId, distance = 0, suppressed = false) {
      const sound = WEAPON_SOUND[weapon];
      const level = attenuation(distance) * (suppressed ? 0.2 : 1);
      if (level < 0.002) return;
      noise(sound.crack * (suppressed ? 0.45 : 1), 0.045, sound.gain * level);
      noise(
        sound.body,
        sound.length,
        sound.gain * 0.5 * level,
        0.008,
        "lowpass",
      );
      tone(
        sound.bass * (suppressed ? 1.6 : 1),
        38,
        sound.length * 0.7,
        0.34 * level,
      );
      // A short, darker reflection gives outdoor gunfire a body without long echoes.
      if (!suppressed)
        noise(
          850,
          sound.length * 1.2,
          sound.gain * 0.11 * level,
          0.075,
          "lowpass",
        );
    },
    impact(surface: Surface, headshot = false) {
      const sound = SURFACE_SOUND[surface];
      noise(sound.frequency, 0.065, 0.11);
      if (sound.ring)
        tone(sound.ring, sound.ring * 0.94, 0.13, 0.035, 0, "triangle");
      if (headshot) {
        tone(1150, 1550, 0.1, 0.12, 0, "sine");
        tone(1800, 1900, 0.16, 0.08, 0.065, "sine");
      }
    },
    step(surface: Surface, sprint: boolean) {
      const sound = SURFACE_SOUND[surface];
      const force = sprint ? 1 : 0.63;
      noise(
        sound.frequency,
        surface === "soil" ? 0.13 : 0.075,
        0.105 * force,
        0,
        "lowpass",
      );
      tone(
        sound.body + Math.random() * 20,
        sound.body * 0.65,
        0.085,
        0.065 * force,
      );
      if (surface === "metal")
        tone(570, 440, 0.12, 0.027 * force, 0.015, "triangle");
    },
    explosion(distance = 0) {
      const level = attenuation(distance);
      noise(1450, 0.14, 0.9 * level, 0, "lowpass");
      noise(280, 1.2, 0.78 * level, 0.02, "lowpass");
      tone(95, 24, 0.8, 0.65 * level);
      noise(650, 0.6, 0.2 * level, 0.16, "lowpass");
    },
    reload() {
      noise(2800, 0.055, 0.13);
      tone(360, 210, 0.09, 0.04, 0.08, "triangle");
      noise(1400, 0.11, 0.085, 0.15);
      noise(3200, 0.045, 0.14, 0.56);
      noise(1850, 0.07, 0.11, 0.72);
    },
    ambient(next: Weather) {
      if (weather === next) return;
      weather = next;
      applyAmbient();
    },
    setVolume(value: number) {
      volume = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0.45));
      if (context && master && !disposed)
        master.gain.setTargetAtTime(volume, context.currentTime, 0.05);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const source of sources) {
        source.onended = null;
        try {
          source.stop();
        } catch {
          /* Already ended. */
        }
        source.disconnect();
        for (const node of transientNodes.get(source) ?? []) node.disconnect();
      }
      sources.clear();
      transientSources.clear();
      transientNodes.clear();
      for (const node of permanentNodes) node.disconnect();
      permanentNodes.clear();
      if (context && context.state !== "closed")
        void context.close().catch(() => undefined);
      context = null;
      master = null;
      bus = null;
      noiseBuffer = null;
      windGain = null;
      rainGain = null;
    },
  };
}
