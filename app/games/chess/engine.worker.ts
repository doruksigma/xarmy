// Stockfish'i CDN'den yükle
const stockfishURL = "https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js";

self.addEventListener('message', async (e) => {
  if (e.data === 'init') {
    try {
      // @ts-ignore
      self.importScripts(stockfishURL);
      // @ts-ignore
      if (typeof self.Stockfish === 'function') {
        // @ts-ignore
        const engine = self.Stockfish();
        engine.onmessage = (msg: string) => self.postMessage(msg);
        
        self.addEventListener('message', (ev) => {
          if (ev.data !== 'init') {
            engine.postMessage(ev.data);
          }
        });
        
        self.postMessage('ready');
      }
    } catch (err) {
      self.postMessage('error');
    }
  }
});
