const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync, readdirSync } = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const output = mkdtempSync(path.join(root, "node_modules", ".europa-tests-"));
const strategy = "app/games/europa-war/strategy";
const sources = readdirSync(path.join(root, strategy))
  .filter((file) => file.endsWith(".test.ts"))
  .sort()
  .map((file) => `${strategy}/${file}`);
try {
  const compile = spawnSync(
    process.execPath,
    [
      require.resolve("typescript/bin/tsc"),
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
      ...sources,
    ],
    { cwd: root, stdio: "inherit" },
  );
  if (compile.status) process.exitCode = compile.status;
  else
    process.exitCode =
      spawnSync(
        process.execPath,
        [
          "--test",
          ...sources.map((s) => path.join(output, s.replace(/\.ts$/, ".js"))),
        ],
        { cwd: root, stdio: "inherit" },
      ).status ?? 1;
} finally {
  rmSync(output, { recursive: true, force: true });
}
