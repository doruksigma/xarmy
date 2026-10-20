# Stockfish 17.1 — source and license

The chess bot and coach use **Stockfish.js 17.1**, distributed as the
`stockfish@17.1.0` npm package. This is Stockfish's lite NNUE, single-threaded
WebAssembly build, without modifications to the engine. Stockfish.js is
copyright 2025 Chess.com, LLC and its contributors, based on Stockfish by
Tord Romstad, Marco Costalba, Joona Kiiski, Gary Linscott, and other contributors.

Stockfish is free software under the **GNU General Public License version 3**.
The complete license is available at [/stockfish/LICENSE.txt](/stockfish/LICENSE.txt)
and beside the generated engine at
[/stockfish/engine/COPYING.txt](/stockfish/engine/COPYING.txt).
The upstream author list is available at
[/stockfish/engine/AUTHORS](/stockfish/engine/AUTHORS).

## Corresponding source and reproducible distribution

The npm registry records commit
`602fd7e1a571a2be71f242942db90483731f2a1f` as this release's `gitHead`.
The corresponding source, engine changes, and build instructions are available
without charge:

- [Source tree at the release commit](https://github.com/nmrugg/stockfish.js/tree/602fd7e1a571a2be71f242942db90483731f2a1f)
- [Source archive at the release commit](https://github.com/nmrugg/stockfish.js/archive/602fd7e1a571a2be71f242942db90483731f2a1f.tar.gz)
- [Build script](https://github.com/nmrugg/stockfish.js/blob/602fd7e1a571a2be71f242942db90483731f2a1f/build.js)
- [Upstream build instructions](https://github.com/nmrugg/stockfish.js/blob/602fd7e1a571a2be71f242942db90483731f2a1f/README.md)
- [Exact npm distribution](https://registry.npmjs.org/stockfish/-/stockfish-17.1.0.tgz)

The upstream project documents Emscripten 3.1.7 and its `./build.js` build
script; use `./build.js --help` for its single-threaded and lite build flags.
Its source and build tooling describe the NNUE evaluation networks included
in the WASM artifact.

This application installs the exact distribution recorded in `package-lock.json`
with npm's integrity verification. `scripts/prepare-stockfish.cjs` copies
`src/stockfish-17.1-lite-single-03e3232.js` and its matching `.wasm` file without
changing their contents, naming them `stockfish.js` and `stockfish.wasm` in
`public/stockfish/engine/`. Run `npm ci` followed by
`npm run prepare:stockfish` to reproduce the served engine files.

The original package SHA-512 integrity is:

```text
sha512-LvxdOzngaMjwdDKkZML4riABX9EWUkIE2ZJUsNvR2yFnM4WLiM6ggEXcBY8v53dK7uAfbxdJFcBiKTIQyGg6Zg==
```
