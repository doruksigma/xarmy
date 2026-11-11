import assert from "node:assert/strict";
import { test } from "node:test";
import {
  actionSound,
  AUDIO_MAX_VOICES,
  audioSettings,
  battlefieldSound,
  createGameAudio,
  DEFAULT_AUDIO,
  SoundGate,
  soundPattern,
  worldSounds,
} from "./game-audio";
import { createWorld } from "./world";

function fakeAudio() {
  const sources: {
    started: boolean;
    stopped: boolean;
    disconnected: boolean;
  }[] = [];
  let created = 0;
  const parameter = () => ({
    value: 0,
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
  });
  function node() {
    return {
      connect(target: unknown) {
        return target;
      },
      disconnect() {},
    };
  }
  function source() {
    const state = { started: false, stopped: false, disconnected: false };
    sources.push(state);
    return {
      ...node(),
      onended: null,
      buffer: null,
      frequency: parameter(),
      type: "sine",
      start() {
        state.started = true;
      },
      stop(at?: number) {
        if (at === undefined) state.stopped = true;
      },
      disconnect() {
        state.disconnected = true;
      },
    };
  }
  const context = {
    state: "running",
    currentTime: 0,
    sampleRate: 8000,
    destination: node(),
    createGain: () => ({ ...node(), gain: parameter() }),
    createBuffer: (_channels: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
    }),
    createOscillator: source,
    createBufferSource: source,
    createBiquadFilter: () => ({
      ...node(),
      frequency: parameter(),
      Q: parameter(),
      type: "lowpass",
    }),
    resume: async () => {
      context.state = "running";
    },
    close: async () => {
      context.state = "closed";
    },
  };
  const audio = createGameAudio(() => {
    created++;
    return context as unknown as AudioContext;
  });
  return { audio, sources, context, created: () => created };
}

test("audio creates no context or source until unlock; all motifs are local", () => {
  const { audio, created, sources } = fakeAudio();
  assert.equal(audio.play("start", 0), false);
  assert.equal(created(), 0);
  assert.equal(sources.length, 0);
  audio.unlock();
  assert.equal(created(), 1);
  assert.equal(audio.play("start", 0), true);
  assert.equal(sources.length, 4);
  assert.ok(sources.every((source) => source.started));
  audio.unlock();
  assert.equal(created(), 1);
  audio.dispose();
});

test("muting immediately stops/disconnects scheduled voices and prevents more audio", () => {
  const { audio, sources } = fakeAudio();
  audio.unlock();
  audio.play("start", 0);
  audio.setSettings({ ...DEFAULT_AUDIO, enabled: false });
  assert.ok(sources.every((source) => source.stopped && source.disconnected));
  assert.equal(audio.stats().activeVoices, 0);
  assert.equal(audio.play("complete", 1000), false);
  assert.equal(audio.unlock(), false);
  audio.setSettings(DEFAULT_AUDIO);
  assert.equal(audio.play("complete", 1100), true);
  audio.setSettings({ ...DEFAULT_AUDIO, volume: 0 });
  assert.equal(audio.stats().activeVoices, 0);
  assert.equal(audio.play("order", 2000), false);
  audio.dispose();
});

test("pause silences battlefield immediately but keeps event/typewriter; hiding silences everything", () => {
  const { audio, sources } = fakeAudio();
  audio.unlock();
  audio.setActivity(true, false);
  audio.play("artillery", 0);
  const battleVoices = sources.length;
  audio.play("typewriter", 100);
  audio.setActivity(true, true);
  assert.ok(sources.slice(0, battleVoices).every((source) => source.stopped));
  assert.ok(sources.slice(battleVoices).every((source) => !source.stopped));
  assert.equal(audio.play("rifle", 1000), false);
  assert.equal(audio.play("typewriter", 1000), true);
  audio.setActivity(false, true);
  assert.equal(audio.stats().activeVoices, 0);
  assert.equal(audio.play("typewriter", 2000), false);
  audio.setActivity(true, false);
  assert.equal(
    audio.stats().activeVoices,
    0,
    "visibility restore never replays old sounds",
  );
  audio.dispose();
});

test("campaign reset preserves freshly requested start/load motif, disposes battlefield, teardown closes context", () => {
  const { audio, context } = fakeAudio();
  audio.unlock();
  audio.setActivity(true, false);
  audio.play("rifle", 0);
  audio.play("start", 100);
  audio.reset();
  assert.equal(audio.stats().activeVoices, 4);
  audio.dispose();
  assert.equal(context.state, "closed");
  assert.equal(audio.stats().activeVoices, 0);
  assert.equal(audio.unlock(), false);
  assert.equal(audio.play("load", 2000), false);
});

test("category toggles and voice ceiling bound expensive playback at fast campaign speeds", () => {
  const { audio } = fakeAudio();
  audio.unlock();
  audio.setActivity(true, false);
  audio.setSettings({ ...DEFAULT_AUDIO, battle: false });
  assert.equal(audio.play("artillery", 0), false);
  assert.equal(audio.play("click", 0), true);
  for (let i = 0; i < 100; i++) audio.play("typewriter", i * 80);
  assert.equal(audio.stats().activeVoices, AUDIO_MAX_VOICES);
  audio.setSettings({ ...DEFAULT_AUDIO, effects: false });
  assert.equal(audio.stats().activeVoices, 0);
  assert.equal(audio.play("complete", 10000), false);
  assert.equal(audio.play("rifle", 10000), true);
  audio.dispose();
});

test("sound gating is wall-clock limited, typewriter capped, globally bounded, no muted backlog", () => {
  const gate = new SoundGate();
  assert.equal(gate.allow("typewriter", 0, DEFAULT_AUDIO, true, true), true);
  assert.equal(gate.allow("typewriter", 74, DEFAULT_AUDIO, true, true), false);
  assert.equal(gate.allow("typewriter", 75, DEFAULT_AUDIO, true, true), true);
  assert.equal(gate.allow("rifle", 100, DEFAULT_AUDIO, true, false), true);
  assert.equal(gate.allow("artillery", 101, DEFAULT_AUDIO, true, false), false);
  assert.equal(gate.allow("artillery", 900, DEFAULT_AUDIO, true, false), true);
  gate.reset();
  for (const cue of [
    "click",
    "start",
    "save",
    "load",
    "research",
    "error",
  ] as const)
    assert.equal(gate.allow(cue, 1000, DEFAULT_AUDIO, true, true), true);
  assert.equal(gate.allow("order", 1001, DEFAULT_AUDIO, true, true), false);
  assert.equal(gate.allow("complete", 2001, DEFAULT_AUDIO, true, true), true);
  assert.equal(
    gate.allow("order", 3000, { ...DEFAULT_AUDIO, enabled: false }, true, true),
    false,
  );
  assert.equal(gate.allow("order", 3001, DEFAULT_AUDIO, true, true), true);
});

test("invalid stored preferences are clamped and each control category is independently retained", () => {
  assert.deepEqual(audioSettings(null), DEFAULT_AUDIO);
  assert.equal(
    audioSettings({ volume: Infinity }).volume,
    DEFAULT_AUDIO.volume,
  );
  assert.equal(audioSettings({ volume: -10 }).volume, 0);
  assert.equal(audioSettings({ volume: 100 }).volume, 1);
  assert.deepEqual(
    audioSettings({
      enabled: false,
      volume: 0.7,
      effects: false,
      battle: true,
    }),
    { enabled: false, volume: 0.7, effects: false, battle: true },
  );
});

test("research/focus completion sounds use real state changes, not canceled jobs or initial save load", () => {
  const previous = createWorld("germany");
  const next = structuredClone(previous);
  next.hour++;
  next.countries.germany.tech.push("audio-test-tech");
  next.countries.germany.focuses.push("industry");
  assert.deepEqual(worldSounds(null, next), []);
  assert.deepEqual(worldSounds(next, next), []);
  assert.deepEqual(worldSounds(previous, next), ["complete", "focus"]);
  assert.deepEqual(worldSounds(next, previous), []);
  const canceled = structuredClone(previous);
  canceled.countries.germany.research = [];
  assert.deepEqual(worldSounds(previous, canceled), []);
  assert.equal(
    previous.countries.germany.tech.includes("audio-test-tech"),
    false,
  );
});

test("defeat has priority, captures have effects, and foreign battles do not produce local gunfire", () => {
  const previous = createWorld("turkey");
  const next = structuredClone(previous);
  next.hour++;
  next.countries.turkey.capitulated = true;
  next.countries.turkey.tech.push("audio-test-tech");
  assert.deepEqual(worldSounds(previous, next), ["defeat"]);
  assert.equal(battlefieldSound(next, 0), null);
  next.countries.turkey.capitulated = false;
  next.countries.turkey.tech = [...previous.countries.turkey.tech];
  const target = Object.values(next.provinces).find(
    (p) => p.controller !== next.player,
  )!;
  target.controller = next.player;
  assert.deepEqual(worldSounds(previous, next), ["capture"]);
  next.battles = [
    {
      id: "foreign",
      province: "poland-0",
      attacker: "germany",
      defender: "poland",
      started: 0,
      attack: 1,
      defense: 1,
    },
  ];
  assert.equal(battlefieldSound(next, 0), null);
  next.battles[0].defender = "turkey";
  assert.equal(battlefieldSound(next, 0), "rifle");
});

test("movement and weapon motifs follow actual troop type; static formations remain quiet", () => {
  const world = createWorld("germany");
  const army = world.armies.find((a) => a.country === world.player)!;
  assert.equal(battlefieldSound(world, 0), null);
  army.move = { to: "germany-1", progress: 0, days: 2 };
  army.type = "infantry";
  assert.equal(battlefieldSound(world, 0), "footstep");
  army.type = "heavyTank";
  assert.equal(battlefieldSound(world, 0), "engine");
  world.battles = [
    {
      id: "local",
      province: army.move.to,
      attacker: world.player,
      defender: "poland",
      started: 0,
      attack: 1,
      defense: 1,
    },
  ];
  assert.equal(battlefieldSound(world, 0), "armor");
  army.type = "artillery";
  assert.equal(battlefieldSound(world, 0), "artillery");
  assert.equal(actionSound({ type: "research", id: "infantry1" }), "research");
  assert.equal(
    actionSound({ type: "moveGroup", armies: [army.id], to: "germany-1" }),
    "order",
  );
  assert.notDeepEqual(soundPattern("rifle"), soundPattern("artillery"));
  assert.notDeepEqual(soundPattern("start"), soundPattern("defeat"));
});

test("research notices and defeat survive rapid clicks without exceeding the voice budget", () => {
  const gate = new SoundGate();
  for (const cue of [
    "click",
    "start",
    "save",
    "load",
    "research",
    "error",
  ] as const)
    assert.equal(gate.allow(cue, 0, DEFAULT_AUDIO, true, true), true);
  assert.equal(gate.allow("order", 1, DEFAULT_AUDIO, true, true), false);
  assert.equal(gate.allow("complete", 1, DEFAULT_AUDIO, true, true), true);
  assert.equal(gate.allow("focus", 2, DEFAULT_AUDIO, true, true), true);
  assert.equal(gate.allow("complete", 400, DEFAULT_AUDIO, true, true), false);
  assert.equal(gate.allow("defeat", 400, DEFAULT_AUDIO, true, true), true);
  assert.equal(gate.allow("victory", 401, DEFAULT_AUDIO, true, true), false);
  const { audio, sources } = fakeAudio();
  audio.unlock();
  for (let i = 0; i < 12; i++) audio.play("typewriter", i * 80);
  assert.equal(audio.stats().activeVoices, AUDIO_MAX_VOICES);
  assert.equal(audio.play("complete", 2000), true);
  assert.equal(audio.stats().activeVoices, 4);
  assert.equal(audio.play("defeat", 2001), true);
  assert.equal(audio.stats().activeVoices, 4);
  assert.ok(
    sources
      .slice(0, -4)
      .every((source) => source.stopped && source.disconnected),
  );
  audio.setSettings({ ...DEFAULT_AUDIO, enabled: false });
  assert.equal(audio.play("victory", 3000), false);
  audio.dispose();
});
