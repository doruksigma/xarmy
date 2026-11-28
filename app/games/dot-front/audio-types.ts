export type SoundMix = {
  masterVolume: number;
  ambienceVolume: number;
  effectsVolume: number;
};

export const DEFAULT_SOUND_MIX: Readonly<SoundMix> = Object.freeze({
  masterVolume: 0.7,
  ambienceVolume: 0.35,
  effectsVolume: 0.8,
});
