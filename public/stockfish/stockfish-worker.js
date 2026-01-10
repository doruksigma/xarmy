// public/stockfish/stockfish-worker.js
// Same-origin worker wrapper: Stockfish'i import eder, mesajları dışarı taşır.

self.importScripts("/stockfish/stockfish.js");

// Bazı build'lerde global Stockfish() var, bazılarında yok.
// 10.0.2 cdnjs genelde Stockfish fonksiyonu sunar.
let engine = null;

try {
  engine = typeof self.Stockfish === "function" ? self.Stockfish() : null;
} catch (e) {
  engine = null;
}

if (!engine) {
  self.postMessage("SF_INIT_FAILED");
} else {
  self.postMessage("SF_INIT_OK");

  engine.onmessage = (e) => {
    // kimi sürüm string gönderir, kimi {data: "..."}
    const msg = typeof e === "string" ? e : e?.data;
    if (msg) self.postMessage(msg);
  };

  self.onmessage = (e) => {
    engine.postMessage(e.data);
  };
}
