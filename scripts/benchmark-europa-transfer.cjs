/* Headless transport benchmark, not a browser/FPS or physical-device guarantee.
   Run: node scripts/benchmark-europa-transfer.cjs
   Optional output: EUROPA_TRANSFER_REPORT=/path/report.json
   Uses real 48-hour simulation sequences and only removes its own tsc directory. */
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { isDeepStrictEqual } = require("node:util");

const root = path.resolve(__dirname, "..");
const strategy = "app/games/europa-war/strategy";
const compiled = fs.mkdtempSync(
  path.join(root, "node_modules", ".europa-transfer-benchmark-"),
);
const reportPath = path.resolve(
  process.env.EUROPA_TRANSFER_REPORT ||
    "/workspace/scratch/europa-transfer-benchmark.json",
);
const HOURS = 48;
const REPEATS = 5;
const WARMUP = 12;

function statistics(values) {
  assert.ok(values.length > 0);
  const sorted = [...values].sort((a, b) => a - b);
  const medianIndex = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2
      ? sorted[medianIndex]
      : (sorted[medianIndex - 1] + sorted[medianIndex]) / 2;
  return {
    samples: values.length,
    median: +median.toFixed(4),
    p95: +sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(4),
    min: +sorted[0].toFixed(4),
    max: +sorted.at(-1).toFixed(4),
  };
}

function measure(operation) {
  const start = performance.now();
  const result = operation();
  return { result, milliseconds: performance.now() - start };
}

function benchmark() {
  const load = (file) => require(path.join(compiled, strategy, `${file}.js`));
  const { createWorld, addArmy, GEOGRAPHY } = load("world");
  const { advanceHour, applyAction } = load("engine");
  const { declareWar } = load("diplomacy");
  const { validateWorld } = load("storage");
  const { worldHour } = load("time");
  const { createStateTransfer, acceptStateTransfer } = load("simulation-state");
  const { fingerprintWorld } = load("world-digest");

  const fixtures = [
    {
      name: "peace",
      description: "Default 1936 historical campaign; no player orders.",
      create: () => createWorld("turkey", "historical", 1936, "normal"),
    },
    {
      name: "moving-group",
      description:
        "Existing Turkish formations receive a real grouped movement order.",
      create: () => {
        let world = createWorld("turkey", "historical", 1936, "normal");
        const origin = world.countries.turkey.capital;
        const members = world.armies.filter(
          (army) => army.country === "turkey",
        );
        assert.ok(members.length >= 2);
        for (const army of members) {
          army.province = origin;
          army.general = null;
        }
        const ordered = applyAction(world, {
          type: "moveGroup",
          armies: members.map((army) => army.id),
          to: "turkey-6",
        });
        assert.equal(ordered.error, null);
        world = ordered.world;
        assert.ok(world.armies.some((army) => army.route.length));
        return world;
      },
    },
    {
      name: "dense-combat",
      description:
        "Synthetic load: 40 added formations per side at four real German–Polish land borders; normal combat rules.",
      create: () => {
        const world = createWorld("germany", "historical", 1936, "normal");
        declareWar(world, "germany", "poland");
        world.countries.germany.autoAssignCommanders = false;
        world.countries.poland.autoAssignCommanders = false;
        const targets = new Set();
        const fronts = [];
        for (const province of Object.values(GEOGRAPHY)) {
          if (world.provinces[province.id].controller !== "germany") continue;
          for (const edge of province.neighbors) {
            if (
              edge.sea ||
              targets.has(edge.id) ||
              world.provinces[edge.id].controller !== "poland" ||
              edge.id === world.countries.poland.capital
            )
              continue;
            targets.add(edge.id);
            fronts.push({ from: province.id, to: edge.id });
            if (fronts.length === 4) break;
          }
          if (fronts.length === 4) break;
        }
        assert.equal(fronts.length, 4);
        for (const { from, to } of fronts) {
          for (let i = 0; i < 40; i++) {
            const attacker = addArmy(
              world,
              "germany",
              from,
              i % 4 === 0 ? "lightTank" : "infantry",
            );
            addArmy(
              world,
              "poland",
              to,
              i % 4 === 0 ? "artillery" : "infantry",
            );
            attacker.route = [to];
            attacker.stance = "advance";
          }
        }
        return world;
      },
    },
  ];

  const scenarios = fixtures.map((fixture) => {
    let worker = fixture.create();
    let local = structuredClone(worker);
    assert.ok(validateWorld(worker), `${fixture.name}: initial schema`);
    const initialDigest = fingerprintWorld(worker);
    const initialArmies = worker.armies.length;
    const counts = { delta: 0, snapshot: 0 };
    const timings = {
      advanceHourMs: [],
      createTransferMs: [],
      fingerprintWorldMs: [],
      receiverCloneAndApplyMs: [],
      fullWorldCloneMs: [],
    };
    let payloadTotal = 0,
      snapshotTotal = 0;
    let retainedCountryReferences = 0,
      retainedProvinceReferences = 0;
    let ordinaryDeltaHoursChecked = 0,
      dayBoundaries = 0;
    let hoursWithMovement = 0,
      hoursWithBattle = 0,
      peakBattles = 0;
    const hourly = [];

    for (let hour = 0; hour < HOURS; hour++) {
      const sourceTick = worldHour(worker);
      const advanced = measure(() => advanceHour(worker));
      const next = advanced.result;
      timings.advanceHourMs.push(advanced.milliseconds);
      assert.ok(
        validateWorld(next),
        `${fixture.name}: hour ${hour + 1} schema`,
      );
      const transferred = measure(() => createStateTransfer(worker, next));
      timings.createTransferMs.push(transferred.milliseconds);
      const { state, metrics } = transferred.result;
      const nextTick = worldHour(next);
      const receive = () =>
        acceptStateTransfer(
          local,
          structuredClone(state),
          sourceTick,
          nextTick,
        );
      const cloneFull = () => structuredClone(next);

      if (hour === 0) {
        for (let i = 0; i < WARMUP; i++) {
          receive();
          cloneFull();
        }
      }
      const receiveSamples = [],
        fullSamples = [];
      let accepted;
      for (let repeat = 0; repeat < REPEATS; repeat++) {
        // Alternate order to avoid consistently charging one side for GC/JIT.
        const deltaFirst = (hour + repeat) % 2 === 0;
        const first = measure(deltaFirst ? receive : cloneFull);
        const second = measure(deltaFirst ? cloneFull : receive);
        const received = deltaFirst ? first : second;
        const cloned = deltaFirst ? second : first;
        receiveSamples.push(received.milliseconds);
        fullSamples.push(cloned.milliseconds);
        accepted = received.result;
        assert.equal(worldHour(cloned.result), nextTick);
      }
      timings.receiverCloneAndApplyMs.push(...receiveSamples);
      timings.fullWorldCloneMs.push(...fullSamples);
      assert.deepEqual(
        accepted,
        next,
        `${fixture.name}: exact hour ${hour + 1}`,
      );
      const digest = measure(() => fingerprintWorld(next));
      timings.fingerprintWorldMs.push(digest.milliseconds);
      assert.equal(fingerprintWorld(accepted), digest.result);
      assert.equal(
        worldHour(local),
        sourceTick,
        "Receiver source was not mutated",
      );

      if (next.hour === 0) dayBoundaries++;
      else if (state.kind === "delta") {
        let countries = 0,
          provinces = 0;
        for (const [id, country] of Object.entries(worker.countries)) {
          if (!isDeepStrictEqual(country, next.countries[id])) continue;
          assert.equal(accepted.countries[id], local.countries[id]);
          countries++;
        }
        for (const [id, province] of Object.entries(worker.provinces)) {
          if (!isDeepStrictEqual(province, next.provinces[id])) continue;
          assert.equal(accepted.provinces[id], local.provinces[id]);
          provinces++;
        }
        if (isDeepStrictEqual(worker.countries, next.countries))
          assert.equal(accepted.countries, local.countries);
        if (isDeepStrictEqual(worker.provinces, next.provinces))
          assert.equal(accepted.provinces, local.provinces);
        assert.ok(countries > 0 && provinces > 0);
        retainedCountryReferences += countries;
        retainedProvinceReferences += provinces;
        ordinaryDeltaHoursChecked++;
      }
      counts[state.kind]++;
      payloadTotal += metrics.payloadBytes;
      snapshotTotal += metrics.snapshotBytes;
      if (next.armies.some((army) => army.move)) hoursWithMovement++;
      if (next.battles.length) hoursWithBattle++;
      peakBattles = Math.max(peakBattles, next.battles.length);
      hourly.push({
        tick: nextTick,
        dayBoundary: next.hour === 0,
        transport: state.kind,
        payloadBytes: metrics.payloadBytes,
        fullSnapshotBytes: metrics.snapshotBytes,
        receiverCloneAndApplyMs: statistics(receiveSamples),
        fullWorldCloneMs: statistics(fullSamples),
      });
      worker = next;
      local = accepted;
    }
    assert.equal(dayBoundaries, 2, "Both daily settlements must be included");
    assert.ok(ordinaryDeltaHoursChecked > 0);
    if (fixture.name === "moving-group") assert.ok(hoursWithMovement > 0);
    if (fixture.name === "dense-combat") assert.ok(peakBattles >= 4);
    return {
      name: fixture.name,
      description: fixture.description,
      hours: HOURS,
      initialArmies,
      finalArmies: worker.armies.length,
      countries: Object.keys(worker.countries).length,
      provinces: Object.keys(worker.provinces).length,
      initialDigest,
      finalDigest: fingerprintWorld(worker),
      counts,
      bytes: {
        transferred: payloadTotal,
        fullSnapshotsEquivalent: snapshotTotal,
        reductionPercent: +(100 * (1 - payloadTotal / snapshotTotal)).toFixed(
          2,
        ),
      },
      assertions: {
        exactWorldsCompared: HOURS,
        matchingFingerprints: HOURS,
        dayBoundaries,
        ordinaryDeltaHoursChecked,
        retainedCountryReferences,
        retainedProvinceReferences,
      },
      activity: { hoursWithMovement, hoursWithBattle, peakBattles },
      timing: Object.fromEntries(
        Object.entries(timings).map(([name, values]) => [
          name,
          statistics(values),
        ]),
      ),
      hourly,
    };
  });

  const report = {
    format: 1,
    generatedAt: new Date().toISOString(),
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpu: os.cpus()[0]?.model || "unknown",
    },
    methodology: {
      hoursPerFixture: HOURS,
      repeatsPerHour: REPEATS,
      warmupPairsPerFixture: WARMUP,
      bytes:
        "UTF-8 JSON-equivalent transfer-envelope sizes; actual structured-clone wire sizes vary.",
      receiver:
        "Node structuredClone(state) + acceptStateTransfer versus structuredClone(fullWorld); timed without validation, assertions or fingerprinting.",
      warning:
        "Headless local measurements include GC/JIT and machine-load noise. Not browser frame times, mobile performance or an FPS guarantee. No wall-clock pass threshold.",
    },
    scenarios,
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        report: reportPath,
        scenarios: scenarios.map((s) => ({
          name: s.name,
          hours: s.hours,
          counts: s.counts,
          bytes: s.bytes,
          activity: s.activity,
          timing: s.timing,
        })),
      },
      null,
      2,
    ),
  );
}

try {
  const sources = ["engine", "storage", "simulation-state", "world-digest"];
  const compile = spawnSync(
    process.execPath,
    [
      require.resolve("typescript/bin/tsc"),
      "--outDir",
      compiled,
      "--rootDir",
      root,
      "--module",
      "commonjs",
      "--target",
      "ES2022",
      "--moduleResolution",
      "node",
      "--resolveJsonModule",
      "--esModuleInterop",
      "--skipLibCheck",
      "--strict",
      ...sources.map((file) => `${strategy}/${file}.ts`),
    ],
    { cwd: root, stdio: "inherit" },
  );
  if (compile.error) throw compile.error;
  if (compile.status !== 0) process.exitCode = compile.status || 1;
  else benchmark();
} finally {
  fs.rmSync(compiled, { recursive: true, force: true });
}
