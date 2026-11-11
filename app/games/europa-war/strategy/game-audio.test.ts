import assert from "node:assert/strict";
import { test } from "node:test";
import {
  actionSound,
  AUDIO_MAX_VOICES,
  audioSettings,
  battlefieldSound,
  createGameAudio,
  createLocalSpeech,
  localTurkishVoice,
  spokenAction,
  spokenNotification,
  type GameSound,
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
    { enabled: false, volume: 0.7, effects: false, battle: true, voice: false },
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
  assert.deepEqual(worldSounds(previous, next), ["complete", "focusComplete"]);
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
  assert.equal(gate.allow("focusComplete", 2, DEFAULT_AUDIO, true, true), true);
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

function voice(
  name: string,
  lang: string,
  localService: boolean,
  isDefault = false,
): SpeechSynthesisVoice {
  return { name, lang, localService, default: isDefault, voiceURI: name };
}
function fakeSpeech(voices = [voice("Local Türkçe", "tr-TR", true)]) {
  const spoken: SpeechSynthesisUtterance[] = [];
  let canceled = 0;
  const synthesis = {
    speaking: false,
    pending: false,
    getVoices: () => voices,
    speak(utterance: SpeechSynthesisUtterance) {
      spoken.push(utterance);
      synthesis.speaking = true;
    },
    cancel() {
      canceled++;
      synthesis.speaking = false;
    },
  };
  const speech = createLocalSpeech({
    synthesis: synthesis as unknown as SpeechSynthesis,
    utterance: (text) =>
      ({
        text,
        voice: null,
        lang: "",
        volume: 1,
        rate: 1,
        pitch: 1,
        onend: null,
        onerror: null,
      }) as unknown as SpeechSynthesisUtterance,
  });
  const finish = () => {
    synthesis.speaking = false;
    const utterance = spoken.at(-1);
    utterance?.onend?.call(utterance, {} as SpeechSynthesisEvent);
  };
  return {
    speech,
    spoken,
    synthesis,
    voices,
    finish,
    canceled: () => canceled,
  };
}

test("older audio preferences keep voice opt-in off and remote Turkish/default English voices are never selected", () => {
  assert.equal(
    audioSettings({ enabled: true, volume: 0.5, effects: true, battle: true })
      .voice,
    false,
  );
  assert.equal(audioSettings({ voice: "true" }).voice, false);
  const remote = voice("Remote Turkish", "tr-TR", false, true);
  const english = voice("Local English", "en-US", true, true);
  assert.equal(localTurkishVoice([remote, english]), null);
  const turkish = voice("Local Turkish", "tr-TR", true);
  assert.equal(localTurkishVoice([remote, english, turkish]), turkish);
  const { speech, spoken } = fakeSpeech([remote, english]);
  speech.unlock();
  speech.setSettings({ ...DEFAULT_AUDIO, voice: true });
  assert.equal(speech.status().available, false);
  assert.equal(speech.speak("Savaş başladı", 0), false);
  assert.equal(spoken.length, 0);
  speech.dispose();
});

test("speech requires both user gesture and opt-in, always pins local voice and master volume", () => {
  const { speech, spoken, finish } = fakeSpeech();
  assert.equal(speech.status().available, true);
  assert.equal(speech.speak("Emir hazır", 0), false);
  speech.unlock();
  assert.equal(speech.speak("Emir hazır", 0), false);
  speech.setSettings({ ...DEFAULT_AUDIO, voice: true, volume: 0.3 });
  assert.equal(speech.speak("Emir hazır", 0), true);
  assert.equal(spoken[0].voice?.localService, true);
  assert.equal(spoken[0].lang, "tr-TR");
  assert.equal(spoken[0].volume, 0.3);
  finish();
  assert.equal(
    speech.speak("Emir hazır", 2000),
    false,
    "identical messages are suppressed for 15 seconds",
  );
  assert.equal(
    speech.speak("Yeni emir", 500),
    false,
    "even a different message has a real-time interval",
  );
  assert.equal(speech.speak("Yeni emir", 2000), true);
  speech.dispose();
});

test("speech never builds a queue, mute/hide/reload/unmount cancel owned utterances without replay", () => {
  const { speech, spoken, canceled } = fakeSpeech();
  speech.unlock();
  speech.setSettings({ ...DEFAULT_AUDIO, voice: true });
  assert.equal(speech.speak("İlk emir", 0), true);
  assert.equal(speech.speak("İkinci emir", 3000), false);
  assert.equal(spoken.length, 1);
  speech.setVisible(false);
  assert.equal(canceled(), 1);
  assert.equal(speech.speak("Arka plan", 5000), false);
  speech.setVisible(true);
  assert.equal(spoken.length, 1);
  assert.equal(speech.speak("Görünür", 6000), true);
  speech.setSettings({ ...DEFAULT_AUDIO, voice: true, enabled: false });
  assert.equal(canceled(), 2);
  assert.equal(speech.speak("Sessiz", 8000), false);
  speech.setSettings({ ...DEFAULT_AUDIO, voice: true });
  speech.speak("Yüklenecek sefer", 10000);
  speech.reset();
  assert.equal(canceled(), 3);
  assert.equal(spoken.length, 3);
  speech.speak("Son emir", 12000);
  speech.dispose();
  assert.equal(canceled(), 4);
  assert.equal(speech.speak("Kapatıldı", 15000), false);
});

test("speech urgent defeat replaces an owned message, never falls back after local voice removal", () => {
  const { speech, spoken, canceled, voices } = fakeSpeech();
  speech.unlock();
  speech.setSettings({ ...DEFAULT_AUDIO, voice: true });
  speech.speak("Birlikler hazır", 0);
  assert.equal(speech.speak("Ülken teslim oldu", 1, true), true);
  assert.equal(canceled(), 1);
  assert.equal(spoken.length, 2);
  voices.splice(0, voices.length, voice("Cloud", "tr-TR", false));
  assert.equal(speech.status().available, false);
  assert.equal(speech.speak("Bulut kullanılmasın", 3000, true), false);
  speech.dispose();
});

test("expanded motifs distinguish confirmed command kinds and actual completions", () => {
  const cases = [
    [{ type: "diplomacy", target: "austria", kind: "war" }, "warDeclaration"],
    [{ type: "diplomacy", target: "austria", kind: "alliance" }, "alliance"],
    [{ type: "diplomacy", target: "austria", kind: "pact" }, "pact"],
    [{ type: "diplomacy", target: "austria", kind: "aid" }, "aid"],
    [{ type: "diplomacy", target: "austria", kind: "embargo" }, "embargo"],
    [{ type: "diplomacy", target: "austria", kind: "peace" }, "peace"],
    [{ type: "commanderStance", general: "test", stance: "attack" }, "assault"],
    [{ type: "commanderStance", general: "test", stance: "defend" }, "defend"],
    [
      { type: "wing", id: "test", mission: "support", target: "germany-0" },
      "airOrder",
    ],
    [
      { type: "ship", id: "test", mission: "patrol", zone: "baltic" },
      "navalOrder",
    ],
    [{ type: "mission", target: "austria", mission: "sabotage" }, "sabotage"],
    [
      { type: "historicalChoice", id: "test", choice: "accept" },
      "historicalAccept",
    ],
    [
      { type: "historicalChoice", id: "test", choice: "decline" },
      "historicalDecline",
    ],
    [{ type: "build", province: "germany-0", building: "rail" }, "railBuild"],
    [{ type: "production", equipment: "rifle", factories: 1 }, "production"],
  ] as const;
  for (const [action, expected] of cases)
    assert.equal(actionSound(action), expected);
  assert.equal(
    spokenAction(
      { type: "diplomacy", target: "austria", kind: "war" },
      createWorld("germany"),
    ),
    "Avusturya ile savaş başladı.",
  );
  assert.match(spokenNotification("focusComplete"), /tamamlandı/);
  assert.equal(
    spokenNotification("rifle"),
    "",
    "combat ambience never narrates continuously",
  );
  const newCues: GameSound[] = [
    "warDeclaration",
    "alliance",
    "pact",
    "trade",
    "embargo",
    "aid",
    "peace",
    "liberation",
    "commander",
    "defend",
    "assault",
    "plan",
    "airOrder",
    "navalOrder",
    "commission",
    "wingReady",
    "intelligence",
    "agentReady",
    "counterIntel",
    "sabotage",
    "railBuild",
    "production",
    "policy",
    "cancel",
    "focusComplete",
    "buildComplete",
    "recruitComplete",
    "historicalAccept",
    "historicalDecline",
    "bombing",
    "support",
  ];
  const patterns = newCues.map((cue) => JSON.stringify(soundPattern(cue)));
  assert.equal(
    new Set(patterns).size,
    newCues.length,
    "each new action family has an audible distinct pattern",
  );
  for (const cue of newCues) {
    const parts = soundPattern(cue);
    assert.ok(parts.length > 0 && parts.length <= AUDIO_MAX_VOICES);
    assert.ok(
      parts.every(
        (part) => part.duration > 0 && part.duration < 1 && part.gain <= 0.2,
      ),
    );
  }
});

test("war alarms and construction completion depend on actual country state; victory cannot be displaced by other completions", () => {
  const before = createWorld("germany"),
    after = structuredClone(before);
  after.hour++;
  after.countries.germany.wars.push("poland");
  assert.deepEqual(worldSounds(before, after), ["warDeclaration"]);
  const fighting = structuredClone(after);
  after.countries.poland.capitulated = true;
  after.countries.germany.tech.push("audio-test-completed");
  after.countries.germany.focuses.push("industry");
  assert.deepEqual(worldSounds(fighting, after), ["victory", "complete"]);
  const builder = structuredClone(before),
    built = structuredClone(before);
  builder.countries.germany.construction.push({
    id: "audio-build",
    province: "germany-0",
    building: "civil",
    progress: 1,
    total: 2,
  });
  built.provinces["germany-0"].buildings.civil++;
  assert.deepEqual(worldSounds(builder, built), ["buildComplete"]);
});
