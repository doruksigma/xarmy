const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const packageRoot = path.join(root, "node_modules", "stockfish");
const entrypoint = fs
  .readdirSync(path.join(packageRoot, "src"))
  .find((name) => /^stockfish-17\.1-lite-single-[a-f0-9]+\.js$/.test(name));
const expectedFiles = {
  "stockfish.js": path.join(packageRoot, "src", entrypoint),
  "stockfish.wasm": path.join(
    packageRoot,
    "src",
    entrypoint.replace(/\.js$/, ".wasm"),
  ),
  "COPYING.txt": path.join(packageRoot, "Copying.txt"),
  AUTHORS: path.join(packageRoot, "AUTHORS"),
};
const loadConfigPath = require.resolve("next/dist/server/config");

function fixture(t, installedPackage = packageRoot) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "xarmy-stockfish-build-"),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(directory, "scripts"));
  fs.mkdirSync(path.join(directory, "node_modules"));
  fs.copyFileSync(
    path.join(root, "next.config.js"),
    path.join(directory, "next.config.js"),
  );
  fs.copyFileSync(
    __dirname + "/prepare-stockfish.cjs",
    path.join(directory, "scripts", "prepare-stockfish.cjs"),
  );
  fs.writeFileSync(path.join(directory, "package.json"), '{"private":true}');
  fs.symlinkSync(
    installedPackage,
    path.join(directory, "node_modules", "stockfish"),
    "junction",
  );
  return directory;
}

function loadNextConfig(directory, phase = "phase-production-build") {
  // Exercise Next's real entry point, bypassing npm's prebuild lifecycle as
  // hosts with a direct `next build` command do. Use a fresh module cache.
  return spawnSync(
    process.execPath,
    [
      "-e",
      `
    const loadConfig = require(${JSON.stringify(loadConfigPath)}).default;
    loadConfig(process.argv[2], process.argv[1], undefined, undefined, true)
      .then(config => {
        const webpack = config.webpack({ module: { rules: [] } });
        if (!webpack.module.rules.some(rule => rule.parser?.worker?.includes("*simulationWorker.create()"))) {
          throw new Error("Europa worker configuration was lost");
        }
      })
      .catch(error => { console.error(error.message); process.exitCode = 1; });
  `,
      directory,
      phase,
    ],
    { cwd: directory, encoding: "utf8", timeout: 30_000 },
  );
}

function assertBundle(directory) {
  const destination = path.join(directory, "public", "stockfish", "engine");
  assert.deepEqual(
    fs.readdirSync(destination).sort(),
    Object.keys(expectedFiles).sort(),
  );
  for (const [name, source] of Object.entries(expectedFiles)) {
    assert.ok(
      fs
        .readFileSync(path.join(destination, name))
        .equals(fs.readFileSync(source)),
      `${name} must match the installed, paired distribution`,
    );
  }
  return destination;
}

for (const phase of [
  "phase-production-build",
  "phase-development-server",
  "phase-production-server",
]) {
  test(`Next ${phase} publishes the complete engine from a clean checkout`, (t) => {
    const directory = fixture(t);
    assert.equal(fs.existsSync(path.join(directory, "public")), false);
    const result = loadNextConfig(directory, phase);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assertBundle(directory);
  });
}

test("reloading config preserves unchanged assets and repairs an incomplete or stale pair", (t) => {
  const directory = fixture(t);
  let result = loadNextConfig(directory);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const destination = assertBundle(directory);
  const oldTime = new Date("2000-01-01T00:00:00Z");
  for (const name of Object.keys(expectedFiles))
    fs.utimesSync(path.join(destination, name), oldTime, oldTime);
  result = loadNextConfig(directory);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  for (const name of Object.keys(expectedFiles)) {
    assert.equal(
      fs.statSync(path.join(destination, name)).mtimeMs,
      oldTime.getTime(),
      `${name} should not be rewritten`,
    );
  }
  fs.writeFileSync(
    path.join(destination, "stockfish.js"),
    "stale cached version",
  );
  fs.unlinkSync(path.join(destination, "stockfish.wasm"));
  result = loadNextConfig(directory);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assertBundle(directory);
});

test("an incomplete installed distribution fails configuration before publishing a partial bundle", (t) => {
  const brokenPackage = fs.mkdtempSync(
    path.join(os.tmpdir(), "xarmy-stockfish-incomplete-"),
  );
  t.after(() => fs.rmSync(brokenPackage, { recursive: true, force: true }));
  fs.mkdirSync(path.join(brokenPackage, "src"));
  fs.copyFileSync(
    path.join(packageRoot, "package.json"),
    path.join(brokenPackage, "package.json"),
  );
  fs.copyFileSync(
    expectedFiles["stockfish.js"],
    path.join(brokenPackage, "src", entrypoint),
  );
  const directory = fixture(t, brokenPackage);
  const result = loadNextConfig(directory);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /stockfish.*\.wasm/i);
  assert.equal(
    fs.existsSync(path.join(directory, "public", "stockfish", "engine")),
    false,
  );
});
