// public/stockfish/stockfish-worker.js
// Robust same-origin wrapper: farklı stockfish build tiplerini destekler.
// - Bazı build: self.Stockfish() fonksiyonu verir (classic wrapper)
// - Bazı build: direkt worker gibi davranır (onmessage/postMessage ile)

(() => {
  function fail(err) {
    try {
      self.postMessage("SF_WORKER_ERROR: " + (err?.message || String(err)));
    } catch {}
    try {
      self.postMessage("SF_INIT_FAILED");
    } catch {}
  }

  try {
    // ✅ same-origin
    self.importScripts("/stockfish/stockfish.js");
  } catch (e) {
    fail(e);
    return;
  }

  // --- MODE A: Stockfish() factory var mı? ---
  let engine = null;
  try {
    if (typeof self.Stockfish === "function") {
      engine = self.Stockfish();
    }
  } catch (e) {
    engine = null;
  }

  // MODE A: engine objesi geldiyse onu köprüle
  if (engine && typeof engine.postMessage === "function") {
    try {
      self.postMessage("SF_INIT_OK");

      engine.onmessage = (e) => {
        const msg = typeof e === "string" ? e : e?.data;
        if (msg != null) self.postMessage(msg);
      };

      self.onmessage = (e) => {
        try {
          engine.postMessage(e.data);
        } catch {}
      };

      return;
    } catch (e) {
      fail(e);
      return;
    }
  }

  // --- MODE B: Script direkt worker gibi davranıyor olabilir ---
  // Bu tipte stockfish.js kendi onmessage handler'ını kurar ve postMessage ile yanıt verir.
  // Biz sadece init sinyali gönderiyoruz ve dışarıyla çakışmamak için onmessage'u override ETMİYORUZ.
  // Eğer burada override edersek motoru bozabiliriz.
  try {
    // Eğer bu build "worker gibi" ise import sonrası zaten hazırdır.
    // Dışarıya init sinyali atalım.
    self.postMessage("SF_INIT_OK");

    // ÖNEMLİ:
    // Bu modda stockfish.js'in kendi onmessage'ı çalışır.
    // Dışarıdan gelen mesajlar otomatik engine'e gider.
    // Engine çıktısı da zaten self.postMessage ile ana threade gelir.
    //
    // Yani burada ekstra köprü kurmuyoruz.
    return;
  } catch (e) {
    fail(e);
    return;
  }
})();
