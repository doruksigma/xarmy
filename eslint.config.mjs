 xarmy@0.1.0 build
> next build
   ▲ Next.js 15.5.9
   Creating an optimized production build ...
 ✓ Compiled successfully in 11.2s
   Linting and checking validity of types ...
 ⨯ ESLint: nextVitals is not iterable
Failed to compile.
./app/games/chess/engine.worker.ts:2:23
Type error: Cannot find module 'stockfish' or its corresponding type declarations.
  1 | // app/games/chess/engine.worker.ts
> 2 | import Stockfish from "stockfish";
