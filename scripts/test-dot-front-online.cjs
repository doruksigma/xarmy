const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync, readdirSync } = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const output = mkdtempSync(path.join(root, "node_modules", ".dot-front-online-tests-"));
const sources = readdirSync(path.join(root, "lib"))
  .filter(file => /^dot-front-room.*\.test\.ts$/.test(file)).sort().map(file => "lib/" + file);
try {
  const compilation = spawnSync(process.execPath, [require.resolve("typescript/bin/tsc"),
    "--outDir", output, "--rootDir", root, "--module", "commonjs", "--target", "ES2022",
    "--moduleResolution", "node", "--esModuleInterop", "--skipLibCheck", "--strict", ...sources],
    { cwd: root, stdio: "inherit" });
  if (compilation.status !== 0) process.exitCode = compilation.status || 1;
  else {
    // Each file owns temporary environment/fetch hooks. Separate processes keep
    // those fixtures isolated while reporting each actual test by name.
    for (const source of sources) {
      const tests = spawnSync(process.execPath, ["--test", "--test-isolation=none",
        path.join(output, source.replace(/\.ts$/, ".js"))], { cwd: root, stdio: "inherit" });
      if (tests.status !== 0) process.exitCode = tests.status ?? 1;
    }
  }
} finally { rmSync(output, { recursive: true, force: true }); }
