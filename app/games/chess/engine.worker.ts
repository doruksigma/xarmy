// Stockfish WASM'i CDN'den yükle
importScripts("https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js");

// @ts-ignore
const stockfish = STOCKFISH();

stockfish.onmessage = (line: string) => {
  postMessage(line);
};

onmessage = (e) => {
  stockfish.postMessage(e.data);
};
