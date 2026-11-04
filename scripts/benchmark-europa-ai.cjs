/* Headless hard-AI benchmark, not a browser or physical-device FPS guarantee.
 * Run: node scripts/benchmark-europa-ai.cjs
 * Optional output: EUROPA_AI_REPORT=/path/report.json
 * Compares the same current engine with only hourly tactical decisions toggled;
 * these modes intentionally make different decisions. Each must replay exactly.
 * Temporary compilation and module replacement affect this process only.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { performance } = require("node:perf_hooks");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const strategy = "app/games/europa-war/strategy";
const output = fs.mkdtempSync(
  path.join(root, "node_modules", ".hard-ai-review-"),
);
const reportPath = path.resolve(
  process.env.EUROPA_AI_REPORT ||
    path.join(os.tmpdir(), "europa-hard-ai-benchmark.json"),
);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
function stats(samples) {
  const s = [...samples].sort((a, b) => a - b);
  return {
    samples: s.length,
    p50Ms: +s[Math.floor(s.length / 2)].toFixed(3),
    p95Ms: +s[Math.ceil(s.length * 0.95) - 1].toFixed(3),
    maxMs: +s.at(-1).toFixed(3),
    totalMs: +s.reduce((a, b) => a + b, 0).toFixed(3),
  };
}
try {
  const compile = spawnSync(
    process.execPath,
    [
      path.join(root, "node_modules/typescript/bin/tsc"),
      "--outDir",
      output,
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
      ...["engine", "storage", "world-digest"].map(
        (f) => `${strategy}/${f}.ts`,
      ),
    ],
    { cwd: root, stdio: "inherit" },
  );
  if (compile.status) throw new Error(`Compilation failed: ${compile.status}`);
  const load = (f) => require(path.join(output, strategy, `${f}.js`));
  const { createWorld, addArmy, GEOGRAPHY } = load("world");
  const { declareWar } = load("diplomacy");
  const { advanceHour } = load("engine");
  const { validateWorld } = load("storage");
  const { fingerprintWorld } = load("world-digest");
  const ai = load("ai");
  const { runCountryTactics } = load("ai-tactics");
  const originalTactics = ai.aiTacticsHour;
  function create(dense) {
    const world = createWorld("turkey", "historical", 1936, "hard");
    for (const [left, right] of [
      ["germany", "poland"],
      ["italy", "france"],
      ["ussr", "finland"],
      ["japan", "china"],
    ])
      declareWar(world, left, right);
    if (dense) {
      const pairs = [
        ["germany", "poland"],
        ["italy", "france"],
        ["ussr", "finland"],
        ["japan", "china"],
      ];
      for (const [left, right] of pairs) {
        world.countries[left].autoAssignCommanders = false;
        world.countries[right].autoAssignCommanders = false;
        const fronts = [];
        const targetIds = new Set();
        for (const p of Object.values(GEOGRAPHY)) {
          if (
            world.provinces[p.id].controller !== left ||
            p.id === world.countries[left].capital
          )
            continue;
          for (const e of p.neighbors) {
            if (
              e.sea ||
              targetIds.has(e.id) ||
              world.provinces[e.id].controller !== right ||
              e.id === world.countries[right].capital
            )
              continue;
            fronts.push([p.id, e.id]);
            targetIds.add(e.id);
            if (fronts.length === 3) break;
          }
          if (fronts.length === 3) break;
        }
        if (!fronts.length) continue;
        for (let n = 0; n < 42; n++) {
          const [from, to] = fronts[n % fronts.length];
          const attacker = addArmy(
            world,
            left,
            from,
            n % 4 === 0 ? "lightTank" : "infantry",
          );
          addArmy(world, right, to, n % 4 === 0 ? "artillery" : "infantry");
          attacker.route = [to];
          attacker.stance = "advance";
        }
      }
      assert.ok(
        world.armies.length >= 500,
        `Dense fixture has ${world.armies.length} armies`,
      );
    }
    assert.ok(validateWorld(world));
    return world;
  }
  // Warm current daily and tactical paths before either comparison.
  let warm = create(true);
  for (let h = 0; h < 24; h++) warm = advanceHour(warm);
  const scenarios = [];
  for (const dense of [false, true]) {
    const initial = create(dense);
    const measurements = {
      enabled: { hour: [], tactics: [], ordinary: [], midnight: [] },
      disabled: { hour: [], tactics: [], ordinary: [], midnight: [] },
    };
    const finalDigests = { enabled: [], disabled: [] };
    const activity = {};
    for (let repeat = 0; repeat < 2; repeat++) {
      for (const enabled of repeat % 2 ? [false, true] : [true, false]) {
        const key = enabled ? "enabled" : "disabled",
          times = measurements[key];
        ai.aiTacticsHour = enabled
          ? (world) => {
              const before = performance.now();
              originalTactics(world);
              times.tactics.push(performance.now() - before);
            }
          : () => {};
        let world = structuredClone(initial),
          battleHours = 0,
          peakBattles = 0;
        for (let h = 0; h < 72; h++) {
          const before = performance.now();
          world = advanceHour(world);
          const ms = performance.now() - before;
          times.hour.push(ms);
          (world.hour === 0 ? times.midnight : times.ordinary).push(ms);
          if (world.battles.length) battleHours++;
          peakBattles = Math.max(peakBattles, world.battles.length);
        }
        assert.ok(validateWorld(world));
        finalDigests[key].push(fingerprintWorld(world));
        activity[key] = {
          finalArmies: world.armies.length,
          battleHours,
          peakBattles,
          finalDay: world.day,
          finalHour: world.hour,
        };
      }
    }
    for (const key of ["enabled", "disabled"])
      assert.equal(
        finalDigests[key][0],
        finalDigests[key][1],
        `${key} must replay deterministically`,
      );
    scenarios.push({
      name: dense ? "dense-global-war" : "starting-global-war",
      countries: Object.keys(initial.countries).length,
      provinces: Object.keys(initial.provinces).length,
      initialArmies: initial.armies.length,
      activity,
      finalDigests,
      timing: Object.fromEntries(
        Object.entries(measurements).map(([k, v]) => [
          k,
          Object.fromEntries(
            Object.entries(v)
              .filter(([, s]) => s.length)
              .map(([label, s]) => [label, stats(s)]),
          ),
        ]),
      ),
    });
    console.log(JSON.stringify(scenarios.at(-1)));
  }
  ai.aiTacticsHour = originalTactics;
  const isolated = createWorld("turkey", "historical", 1936, "hard");
  const capital = isolated.countries.germany.capital;
  const neighbors = new Set(GEOGRAPHY[capital].neighbors.map((e) => e.id));
  for (const id of neighbors) isolated.provinces[id].controller = "poland";
  const origin = Object.values(GEOGRAPHY).find(
    (p) =>
      isolated.provinces[p.id].controller === "germany" &&
      p.id !== capital &&
      !neighbors.has(p.id),
  ).id;
  for (const a of isolated.armies.filter((a) => a.country === "germany")) {
    a.province = origin;
    a.general = null;
  }
  for (let n = 0; n < 500; n++) addArmy(isolated, "germany", origin);
  const blocked = [];
  for (let repeat = 0; repeat < 8; repeat++) {
    const world = structuredClone(isolated),
      before = performance.now();
    runCountryTactics(world, "germany");
    blocked.push(performance.now() - before);
    assert.equal(
      world.armies.filter((a) => a.country === "germany" && a.route.length)
        .length,
      0,
    );
    assert.ok(validateWorld(world));
  }
  const blockedCapital = {
    armyCount: isolated.armies.length,
    candidateCount: isolated.armies.filter((a) => a.country === "germany")
      .length,
    isolatedCapital: capital,
    origin,
    timing: stats(blocked),
  };
  const report = {
    generatedAt: new Date().toISOString(),
    runtime: { node: process.version, cpu: os.cpus()[0]?.model },
    methodology:
      "Headless Node timings, 72 simulated hours repeated twice per mode. Disabled mode turns off only the new hourly tactics hook; weekly AI, combat, economy and all other rules stay current. Synthetic dense case adds formations at real borders. Not browser/device FPS. Separate blocked-capital case uses 500 identical-origin extra survivors.",
    scenarios,
    blockedCapital,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ report: reportPath, blockedCapital }));
} finally {
  fs.rmSync(output, { recursive: true, force: true });
}
