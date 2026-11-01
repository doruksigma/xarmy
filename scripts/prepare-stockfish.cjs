#!/usr/bin/env node
// Publish exactly the JS/WASM pair from the lockfile-installed distribution.
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

function prepareStockfish() {
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
  const files = [
    [path.join(source, entrypoint), "stockfish.js"],
    [path.join(source, entrypoint.replace(/\.js$/, ".wasm")), "stockfish.wasm"],
    [path.join(packageRoot, "Copying.txt"), "COPYING.txt"],
    [path.join(packageRoot, "AUTHORS"), "AUTHORS"],
  ].map(([filename, name]) => ({ name, contents: fs.readFileSync(filename) }));

  // Validate the entire installed pair before publishing anything. In
  // particular, never ship a JS-only bundle after an incomplete installation.
  for (const { name, contents } of files) {
    if (!contents.length)
      throw new Error(`Installed Stockfish ${name} is empty`);
  }
  const wasm = files.find(({ name }) => name === "stockfish.wasm").contents;
  if (!wasm.subarray(0, 8).equals(Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]))) {
    throw new Error(
      "Installed Stockfish stockfish.wasm has an invalid WASM header",
    );
  }

  const destination = path.join(root, "public", "stockfish", "engine");
  let changed = 0;
  for (const { name, contents } of files) {
    const target = path.join(destination, name);
    let existing;
    try {
      existing = fs.readFileSync(target);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    // Next can load configuration several times per build. Leave valid files
    // untouched, including when starting with already-published read-only assets.
    if (existing?.equals(contents)) continue;
    fs.mkdirSync(destination, { recursive: true });
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, contents);
      fs.renameSync(temporary, target);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
    changed++;
  }
  return { version: stockfishPackage.version, changed };
}

module.exports = { prepareStockfish };

if (require.main === module) {
  const { version, changed } = prepareStockfish();
  console.log(
    `Prepared Stockfish ${version} lite single-threaded WASM (${changed} files updated)`,
  );
}
