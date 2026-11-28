import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";
import { soundEffects, unlockAudio } from "./audio";

// Deterministic WebAudio/DOM mocks verify scheduling and ownership, not device
// output quality or Safari autoplay policy. Real-browser checks are separate.
class Parameter {
  value = 1;
  targets: number[] = [];
  cancelScheduledValues() {}
  setTargetAtTime(value: number) { this.value = value; this.targets.push(value); }
}
class Node {
  connected: Node[] = [];
  disconnected = false;
  connect(node: Node) { this.connected.push(node); return node; }
  disconnect() { this.disconnected = true; this.connected = []; }
}
class Gain extends Node { gain = new Parameter(); }
class Panner extends Node { pan = new Parameter(); }
class Source extends Node {
  buffer: { id: number } | null = null;
  loop = false;
  playbackRate = new Parameter();
  loopStart = 0; loopEnd = 0; offset = 0; startedAt = 0;
  onended: (() => void) | null = null;
  started = false;
  stopped = false;
  start(when = 0, offset = 0) { this.started = true; this.startedAt = when; this.offset = offset; }
  stop() { this.stopped = true; this.onended?.(); }
  end() { this.stopped = true; this.onended?.(); }
}
class Compressor extends Node {
  threshold = new Parameter(); knee = new Parameter(); ratio = new Parameter();
  attack = new Parameter(); release = new Parameter();
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function settle() { for (let i = 0; i < 24; i++) await Promise.resolve(); }
let environmentId = 0;
function environment(t: TestContext, options: { resumeGate?: Promise<void>; fetchGate?: Promise<void>; decodeGate?: Promise<void>; mono?: boolean; failClosedDecode?: boolean; fail?: "fetch" | "decode" | "resume" } = {}) {
  const document = Object.assign(new EventTarget(), { hidden: false, baseURI: `https://audio.example.test/case-${++environmentId}/` });
  const requests: string[] = [], contexts: Context[] = [], buses: ReturnType<typeof soundEffects>[] = [];
  let nextTimer = 0, clock = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  class Context {
    state: AudioContextState = "suspended";
    sampleRate = 48000;
    currentTime = 0;
    destination = new Node();
    gains: Gain[] = [];
    panners: Panner[] = [];
    sources: Source[] = [];
    compressors: Compressor[] = [];
    resumes = 0; suspends = 0; closes = 0; decodes = 0;
    constructor() {
      contexts.push(this);
      if (options.mono) Object.defineProperty(this, "createStereoPanner", { value: undefined });
    }
    async resume() {
      this.resumes++;
      if (options.fail === "resume") throw new Error("gesture denied");
      await options.resumeGate;
      if (this.state !== "closed") this.state = "running";
    }
    async suspend() { this.suspends++; if (this.state !== "closed") this.state = "suspended"; }
    async close() { this.closes++; this.state = "closed"; }
    createGain() { const node = new Gain(); this.gains.push(node); return node; }
    createStereoPanner() { const node = new Panner(); this.panners.push(node); return node; }
    createBufferSource() { const node = new Source(); this.sources.push(node); return node; }
    createDynamicsCompressor() { const node = new Compressor(); this.compressors.push(node); return node; }
    async decodeAudioData(bytes: ArrayBuffer) {
      this.decodes++;
      await options.decodeGate;
      if (options.fail === "decode" || options.failClosedDecode && this.state === "closed") throw new Error("unsupported sample");
      return { id: new Uint8Array(bytes)[0], duration: 24 };
    }
  }
  const window = Object.assign(new EventTarget(), { AudioContext: Context, location: { href: document.baseURI, origin: "https://audio.example.test" } });
  const globals: Record<string, unknown> = {
    document, window,
    async fetch(url: string) {
      requests.push(url);
      await options.fetchGate;
      if (options.fail === "fetch") throw new Error("offline");
      const id = ["ambience", "light-shot", "light-shot-2", "heavy-shot", "heavy-shot-2", "impact"].indexOf(url.split("/").at(-1)!.replace(".mp3", "")) + 1;
      return { ok: true, arrayBuffer: async () => new Uint8Array([id]).buffer };
    },
    setTimeout(callback: () => void, delay: number) { const id = ++nextTimer; timers.set(id, { at: clock + delay, callback }); return id; },
    clearTimeout(id: number) { timers.delete(id); },
  };
  const originals = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  function tick(milliseconds: number) {
    clock += milliseconds;
    for (const [id, timer] of [...timers]) if (timer.at <= clock && timers.has(id)) { timers.delete(id); timer.callback(); }
  }
  t.after(async () => {
    for (const bus of buses) bus.dispose();
    tick(2000);
    for (const context of contexts) await context.close();
    await settle();
    for (const key of Object.keys(globals)) {
      if (originals[key]) Object.defineProperty(globalThis, key, originals[key]!);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  return {
    document, window, requests, contexts, tick,
    bus(base = "./audio/") { const bus = soundEffects(base); buses.push(bus); return bus; },
    live() { return contexts.flatMap(context => context.sources.filter(source => source.started && !source.stopped)); },
  };
}

test("mount/settings/enable do not create or fetch audio; only the synchronous gesture unlock does", async t => {
  const env = environment(t), bus = env.bus();
  bus.configure({ masterVolume: 0.6 });
  await bus.enable();
  assert.equal(env.contexts.length, 0);
  assert.equal(env.requests.length, 0);
  unlockAudio();
  assert.equal(env.contexts.length, 1);
  assert.equal(env.contexts[0].resumes, 1, "resume is called inside the gesture before awaiting samples");
  await bus.enable();
  assert.equal(env.requests.length, 6);
  assert.ok(env.requests.every(url => url.startsWith(`${env.document.baseURI}audio/`)));
  assert.equal(env.live().length, 1);
  assert.equal(env.live()[0].loop, true);
  assert.equal(env.live()[0].loopStart, 1);
  assert.equal(env.live()[0].loopEnd, 25);
  assert.equal(env.live()[0].offset, 1);
});

test("an online lobby primes silently, then suspends; a later battle reuses its unlocked context", async t => {
  const env = environment(t);
  unlockAudio(); await settle();
  assert.equal(env.requests.length, 0);
  assert.equal(env.live().length, 0);
  env.tick(1000);
  assert.equal(env.contexts[0].state, "suspended");
  await env.bus().enable();
  assert.equal(env.contexts.length, 1);
  assert.equal(env.contexts[0].state, "running");
  assert.equal(env.live().length, 1);
});

test("concurrent enables and buses share one fetch/decode per sample without duplicate loops", async t => {
  const env = environment(t), first = env.bus(), second = env.bus();
  unlockAudio();
  await Promise.all([first.enable(), first.enable(), second.enable()]);
  assert.equal(env.contexts.length, 1);
  assert.equal(env.requests.length, 6);
  assert.equal(env.contexts[0].decodes, 6);
  assert.equal(env.live().length, 2, "one loop per owning active bus");
  first.stop();
  assert.equal(env.live().length, 1);
  assert.equal(env.contexts[0].state, "running", "one paused owner cannot suspend another active owner");
  second.stop();
  assert.equal(env.contexts[0].state, "suspended");
  await first.enable();
  assert.equal(env.requests.length, 6);
  assert.equal(env.contexts[0].decodes, 6);
  assert.equal(env.live().length, 1);
});

test("StrictMode disposal/remount transfers the context, stops old voices and cancels its deferred close", async t => {
  const env = environment(t), first = env.bus();
  unlockAudio(); await first.enable();
  first.shot({ kind: "light", pan: 0, distance: 0 });
  first.dispose();
  assert.equal(env.live().length, 0);
  const second = env.bus();
  await second.enable();
  env.tick(200);
  assert.equal(env.contexts.length, 1);
  assert.equal(env.contexts[0].closes, 0);
  assert.equal(env.live().length, 1);
  second.dispose(); env.tick(200);
  assert.equal(env.contexts[0].state, "closed");
  assert.equal(env.live().length, 0);
});

test("pause during fetching never starts a late ambience or replays missed shots", async t => {
  const gate = deferred<void>(), env = environment(t, { fetchGate: gate.promise }), bus = env.bus();
  unlockAudio();
  const pending = bus.enable();
  bus.shot({ kind: "heavy", pan: 1, distance: 0 });
  bus.stop(); gate.resolve(); await pending;
  assert.equal(env.live().length, 0);
  assert.equal(env.contexts[0].state, "suspended");
  await bus.enable();
  assert.equal(env.live().length, 1, "resume starts only the loop, no combat backlog");
  assert.equal(env.requests.length, 6);
});

test("dispose during decoding closes ownership and late decode completion cannot revive nodes", async t => {
  const gate = deferred<void>(), env = environment(t, { decodeGate: gate.promise }), bus = env.bus();
  unlockAudio(); const pending = bus.enable(); await settle();
  assert.equal(env.contexts[0].decodes, 6);
  bus.dispose(); env.tick(200); gate.resolve(); await pending;
  assert.equal(env.contexts[0].state, "closed");
  assert.equal(env.contexts[0].sources.length, 0);
  await bus.enable();
  assert.equal(env.contexts.length, 1);
});

test("pause or dispose during a pending resume cannot leave a resumed context playing", async t => {
  const gate = deferred<void>(), env = environment(t, { resumeGate: gate.promise }), bus = env.bus();
  unlockAudio(); const pending = bus.enable();
  bus.stop(); gate.resolve(); await pending;
  assert.equal(env.contexts[0].state, "suspended");
  assert.equal(env.live().length, 0);
  await bus.enable();
  assert.equal(env.live().length, 1);
});

test("stop followed by enable while the old fetch is pending starts exactly one fresh loop", async t => {
  const gate = deferred<void>(), env = environment(t, { fetchGate: gate.promise }), bus = env.bus();
  unlockAudio(); const old = bus.enable();
  bus.stop(); const current = bus.enable();
  gate.resolve(); await Promise.all([old, current]);
  assert.equal(env.requests.length, 6);
  assert.equal(env.live().length, 1);
  assert.equal(env.contexts[0].state, "running");
});

test("hidden/pagehide stop active audio and returning does not implicitly resume it", async t => {
  const env = environment(t), bus = env.bus();
  unlockAudio(); await bus.enable();
  env.document.hidden = true; env.document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(env.live().length, 0);
  assert.equal(env.contexts[0].state, "suspended");
  await bus.enable(); unlockAudio();
  assert.equal(env.live().length, 0);
  env.document.hidden = false; env.document.dispatchEvent(new Event("visibilitychange"));
  await settle(); assert.equal(env.live().length, 0);
  await bus.enable(); assert.equal(env.live().length, 1);
  env.window.dispatchEvent(new Event("pagehide"));
  assert.equal(env.live().length, 0);
});

test("master/ambience/effects gains are independently clamped, smoothed and immediately mute voices", async t => {
  const env = environment(t), bus = env.bus();
  unlockAudio(); await bus.enable();
  const context = env.contexts[0];
  bus.configure({ masterVolume: 2, ambienceVolume: 0.5, effectsVolume: 0.6 });
  assert.equal(context.gains[0].gain.value, 1);
  assert.equal(context.gains[1].gain.value, 0.28);
  assert.equal(context.gains[2].gain.value, 0.6);
  assert.ok(context.gains.slice(0, 3).every(gain => gain.gain.targets.length >= 2));
  bus.shot({ kind: "light", pan: 0, distance: 0 });
  assert.equal(env.live().length, 2);
  bus.configure({ effectsVolume: 0 }); assert.equal(env.live().length, 1);
  bus.configure({ ambienceVolume: 0 }); assert.equal(env.live().length, 0);
  bus.configure({ masterVolume: -1 });
  assert.equal(context.state, "suspended");
  bus.configure({ masterVolume: Number.NaN }); assert.equal(context.gains[0].gain.value, 0);
  bus.configure({ masterVolume: 0.7, ambienceVolume: 0.35 }); await settle();
  assert.equal(env.live().length, 1);
});

test("master zero during fetching cannot start late sources; unmute reuses already loaded samples", async t => {
  const gate = deferred<void>(), env = environment(t, { fetchGate: gate.promise }), bus = env.bus();
  unlockAudio(); const pending = bus.enable();
  bus.configure({ masterVolume: 0 }); gate.resolve(); await pending;
  assert.equal(env.live().length, 0);
  bus.configure({ masterVolume: 0.7 }); await settle();
  assert.equal(env.live().length, 1);
  assert.equal(env.requests.length, 6);
});

test("sampled shots alternate recordings, use stereo/falloff and drop distant events", async t => {
  const env = environment(t), bus = env.bus();
  unlockAudio(); await bus.enable();
  const context = env.contexts[0];
  bus.shot({ kind: "light", pan: -0.8, distance: 0 });
  context.currentTime += 0.1;
  bus.shot({ kind: "light", pan: 0.9, distance: 0.5 });
  const effects = context.sources.filter(source => !source.loop);
  assert.deepEqual(effects.map(source => source.buffer?.id), [2, 3]);
  assert.deepEqual(context.panners.map(node => node.pan.value), [-0.8, 0.9]);
  assert.equal((effects[1].connected[0] as Gain).gain.value, (effects[0].connected[0] as Gain).gain.value / 4);
  assert.ok(effects.every(source => source.playbackRate.value >= 0.97 && source.playbackRate.value <= 1.03));
  context.currentTime += 1; bus.shot({ kind: "heavy", pan: 0, distance: 1 });
  assert.equal(context.sources.length, 3);
  context.currentTime += 1; bus.impact({ pan: Number.NaN, distance: 0 });
  assert.equal(context.panners.at(-1)?.pan.value, 0);
});

test("voice/rate limits bound a crowded accelerated battle, release ended nodes and never queue events", async t => {
  const env = environment(t), bus = env.bus();
  unlockAudio(); await bus.enable();
  const context = env.contexts[0];
  for (let i = 0; i < 1000; i++) bus.shot({ kind: "light", pan: 0, distance: 0 });
  assert.equal(env.live().length, 2, "same-frame shots are rate limited");
  for (let i = 0; i < 100; i++) { context.currentTime += 0.2; bus.shot({ kind: "heavy", pan: 0, distance: 0 }); }
  assert.equal(env.live().length, 12);
  const ended = env.live().find(source => !source.loop)!;
  ended.end(); assert.ok(ended.disconnected);
  context.currentTime += 1; bus.shot({ kind: "light", pan: 0, distance: 0 });
  assert.equal(env.live().length, 12);
  bus.stop(); await bus.enable();
  assert.equal(env.live().length, 1);
});

test("stereo-unavailable browsers use mono samples, while unsupported audio remains harmless", async t => {
  const env = environment(t, { mono: true }), bus = env.bus();
  unlockAudio(); await bus.enable();
  bus.shot({ kind: "heavy", pan: 1, distance: 0 });
  assert.equal(env.live().length, 2);
  assert.equal(env.contexts[0].panners.length, 0);
  bus.dispose(); env.tick(200);
  Object.defineProperty(env.window, "AudioContext", { value: undefined });
  unlockAudio(); await env.bus().enable();
  assert.equal(env.contexts.length, 1);
});

for (const fail of ["fetch", "decode", "resume"] as const) test(`${fail} failure is nonfatal and cannot create voices`, async t => {
  const env = environment(t, { fail }), bus = env.bus();
  unlockAudio(); await bus.enable();
  bus.shot({ kind: "heavy", pan: 0, distance: 0 }); bus.impact({ pan: 0, distance: 0 });
  assert.equal(env.live().length, 0);
  bus.stop(); await bus.enable();
  assert.equal(env.live().length, 0);
});

test("external sample bases are refused and default assets remain same-origin", async t => {
  const env = environment(t), blocked = env.bus("https://other.example/audio/");
  unlockAudio(); await blocked.enable();
  assert.equal(env.requests.length, 0);
  blocked.dispose();
  await env.bus("/dot-front/audio/").enable();
  assert.ok(env.requests.every(url => url.startsWith("https://audio.example.test/dot-front/audio/")));
});

test("a decode pending in a disposed context cannot poison a new context's shared sample cache", async t => {
  const gate = deferred<void>(), env = environment(t, { decodeGate: gate.promise, failClosedDecode: true }), first = env.bus();
  unlockAudio(); const abandoned = first.enable(); await settle();
  first.dispose(); env.tick(200);
  assert.equal(env.contexts[0].state, "closed");
  const second = env.bus(); unlockAudio(); const current = second.enable(); await settle();
  assert.equal(env.contexts.length, 2);
  assert.equal(env.requests.length, 6, "the second context reuses the encoded downloads");
  assert.equal(env.contexts[1].decodes, 6, "pending decodes are re-owned rather than inherited from the closed context");
  gate.resolve(); await Promise.all([abandoned, current]);
  assert.equal(env.live().length, 1);
  assert.equal(env.contexts[0].sources.length, 0);
  assert.equal(env.contexts[1].state, "running");
});

test("simultaneous rifle/heavy fire is audible together and distant events cannot consume a nearby shot's gate", async t => {
  const env = environment(t), bus = env.bus();
  unlockAudio(); await bus.enable();
  bus.shot({ kind: "light", pan: 0, distance: 1 });
  bus.shot({ kind: "light", pan: -0.5, distance: 0 });
  bus.shot({ kind: "heavy", pan: 0.5, distance: 0 });
  assert.deepEqual(env.contexts[0].sources.filter(source => !source.loop).map(source => source.buffer?.id), [2, 4]);
});

test("turning ambience back on at the effect voice limit never creates a thirteenth voice", async t => {
  const env = environment(t), bus = env.bus();
  bus.configure({ ambienceVolume: 0 }); unlockAudio(); await bus.enable();
  const context = env.contexts[0];
  for (let i = 0; i < 20; i++) { context.currentTime += 0.2; bus.shot({ kind: "light", pan: 0, distance: 0 }); }
  assert.equal(env.live().length, 12);
  bus.configure({ ambienceVolume: 0.35 }); await settle();
  assert.equal(env.live().length, 12);
  assert.equal(env.live().filter(source => source.loop).length, 1);
});

test("successfully decoded buffers remain reusable after the previous context has fully closed", async t => {
  const env = environment(t), first = env.bus();
  unlockAudio(); await first.enable();
  first.dispose(); env.tick(200);
  const second = env.bus(); unlockAudio(); await second.enable();
  assert.equal(env.contexts.length, 2);
  assert.equal(env.requests.length, 6);
  assert.equal(env.contexts[1].decodes, 0);
  assert.equal(env.live().length, 1);
});

test("a zero-volume enabled bus stays lazy even after a gesture and unmute starts one loop", async t => {
  const env = environment(t), bus = env.bus();
  bus.configure({ masterVolume: 0 }); await bus.enable();
  unlockAudio(); await settle();
  assert.equal(env.requests.length, 0);
  assert.equal(env.live().length, 0);
  bus.configure({ masterVolume: 0.7 }); await settle();
  assert.equal(env.requests.length, 6);
  assert.equal(env.live().length, 1);
});
