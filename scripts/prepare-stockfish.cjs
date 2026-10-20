#!/usr/bin/env node
// Publish exactly the JS/WASM pair from the lockfile-installed distribution.
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const packageRoot = path.join(root, "node_modules", "stockfish");
const stockfishPackage = JSON.parse(
  fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"),
);
if (stockfishPackage.version !== "17.1.0") {
  throw new Error(
    `Expected Stockfish 17.1.0 from package-lock.json, received ${stockfishPackage.version}`,
  );
}
const source = path.join(packageRoot, "src");
const entrypoints = fs
  .readdirSync(source)
  .filter((name) => /^stockfish-17\.1-lite-single-[a-f0-9]+\.js$/.test(name));
if (entrypoints.length !== 1)
  throw new Error(
    "Could not locate the single-threaded Stockfish 17.1 lite engine",
  );
const entrypoint = entrypoints[0];
const wasm = entrypoint.replace(/\.js$/, ".wasm");
const destination = path.join(root, "public", "stockfish", "engine");
fs.mkdirSync(destination, { recursive: true });
fs.copyFileSync(
  path.join(source, entrypoint),
  path.join(destination, "stockfish.js"),
);
fs.copyFileSync(
  path.join(source, wasm),
  path.join(destination, "stockfish.wasm"),
);
fs.copyFileSync(
  path.join(packageRoot, "Copying.txt"),
  path.join(destination, "COPYING.txt"),
);
fs.copyFileSync(
  path.join(packageRoot, "AUTHORS"),
  path.join(destination, "AUTHORS"),
);
console.log(
  `Prepared Stockfish ${stockfishPackage.version} lite single-threaded WASM`,
);
