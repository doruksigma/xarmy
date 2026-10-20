const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync } = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = mkdtempSync(path.join(root, "node_modules", ".chess-tests-"));
const sources = [
  "lib/chess-room.test.ts",
  "lib/chess-room-store.test.ts",
  "app/games/chess/bot.test.ts",
  "app/games/chess/coach.test.ts",
  "app/games/chess/stockfish-client.test.ts",
];
try {
  const compilation = spawnSync(
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
      "--esModuleInterop",
      "--skipLibCheck",
      "--strict",
      ...sources,
    ],
    { cwd: root, stdio: "inherit" },
  );
  if (compilation.status !== 0) process.exitCode = compilation.status || 1;
  else {
    const tests = spawnSync(
      process.execPath,
      [
        "--test",
        ...sources.map((source) =>
          path.join(output, source.replace(/\.ts$/, ".js")),
        ),
      ],
      { cwd: root, stdio: "inherit" },
    );
    process.exitCode = tests.status ?? 1;
  }
} finally {
  rmSync(output, { recursive: true, force: true });
}
