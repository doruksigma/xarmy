export function soundEffects() {
  let audio: AudioContext | null = null;
  let last = 0;
  return {
    async enable() {
      if (!window.AudioContext) return;
      audio ??= new AudioContext();
      if (audio.state === "suspended") await audio.resume();
    },
    hit() {
      if (!audio || audio.state !== "running" || audio.currentTime - last < 0.11) return;
      last = audio.currentTime;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(145, last);
      oscillator.frequency.exponentialRampToValueAtTime(55, last + 0.075);
      gain.gain.setValueAtTime(0.10, last);
      gain.gain.exponentialRampToValueAtTime(0.001, last + 0.09);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start();
      oscillator.stop(last + 0.1);
    },
    stop() {
      if (audio?.state === "running") void audio.suspend().catch(() => {});
    },
    dispose() {
      if (audio && audio.state !== "closed") void audio.close().catch(() => {});
      audio = null;
    },
  };
}
