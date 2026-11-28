# Dot Front — audio sources and licenses

This local sound bank uses edited recordings, not oscillator click/beep placeholders. Rifle bursts are assembled from recorded firearms. The heavier effects use recorded fireworks layered and filtered as game explosions; they are not presented as recordings of real artillery. The background combines recorded wind with quiet, distant versions of those effects.

## Firearm recordings — CC BY 3.0

**“Gunshot Sounds”, © 2009 Vincent Sevedge**, submitted to OpenGameArt by **Tabasco**.

- Source page: https://opengameart.org/content/gunshot-sounds
- Original archive: https://opengameart.org/sites/default/files/sounds.zip
- License: Creative Commons Attribution 3.0 Unported — https://creativecommons.org/licenses/by/3.0/
- Original files used: `sounds/sks.wav`, `sounds/mosin.wav`.
- The OpenGameArt page displays CC0, but the archive contains a more specific copyright and CC BY 3.0 notice. This package conservatively honors that included attribution license. Its notice is reproduced in `source-license.txt`.
- Changes: selected individual shots, trimmed leading silence, removed low-frequency noise, filtered, faded, layered into short bursts, slightly varied playback pitch, normalized and encoded to MP3. The background uses quieter, low-pass-filtered copies.
- Derived files: `light-shot.mp3`, `light-shot-2.mp3`, and the combined `ambience.mp3`. These adaptations are distributed under CC BY 3.0. Keep this attribution with redistributed copies and retain the in-game credits link.

## Firework / cannon recordings — CC0

**“25 CC0 bang / firework SFX” by rubberduck**, published 2019.

- Source page: https://opengameart.org/content/25-cc0-bang-firework-sfx
- Original archive: https://opengameart.org/sites/default/files/25-CC0-bang-sfx.zip
- License: CC0 1.0 Universal — https://creativecommons.org/publicdomain/zero/1.0/
- Original files used: `cannon_01.ogg`, `cannon_02.ogg`, `fw_04.ogg`, `bang_05.ogg`, `bang_09.ogg`, `shot_03.ogg`.
- The author describes the source material as recorded fireworks. Changes: trimmed attacks, lower-pitched layers, low/high-pass filtering, mixing, fades, level normalization and MP3 encoding.
- Derived files: `heavy-shot.mp3`, `heavy-shot-2.mp3`, `impact.mp3`; quieter layers also appear in `ambience.mp3`. The three standalone effects are released under CC0.

## Wind recording — CC0

**“Mild Wind Background Noise” by Bashar3A**, credited as **Bashar from Skirmish.io**, published 2020.

- Source page: https://opengameart.org/content/mild-wind-background-noise
- Original file: https://opengameart.org/sites/default/files/wind%20background%20noise%202.wav
- Author link supplied with the original: https://skirmish.io/bashar
- License: CC0 1.0 Universal — https://creativecommons.org/publicdomain/zero/1.0/
- Changes: selected a 27-second portion, filtered and leveled it, crossfaded a 24-second loop, mixed distant effects, added cyclic encoder guards and encoded to MP3.
- Used in `ambience.mp3`; that combined adaptation follows the CC BY 3.0 license of its firearm layers.

## Playback and verification

All six MP3 files are served from this site's `/dot-front/audio/` folder. No third-party audio requests are needed during a match. `manifest.json` lists exact sizes, durations, levels, source hashes and output hashes.

For `ambience.mp3`, use **loopStart = 1 second, loopEnd = 25 seconds**, and begin at offset 1. The outer one-second cyclic guards keep MP3 encoder padding outside the 24-second loop. Other files are one-shots.

The generator decodes every output and verifies non-silent audio, sub-full-scale peaks, immediate effect attacks, and a bounded loop seam. These are objective file checks; they do not claim listening tests on physical phones or tablets.

Rebuild with `python scripts/build-dot-front-audio.py --source-dir /tmp/dot-front-audio-src --download` from the repository root. Python 3, NumPy, SciPy and FFmpeg are development-only requirements. Source checksums are pinned; the normal site build does not download or regenerate audio.

Source licenses were checked on 28 November 2026. Original creators are not associated with or endorsing Dot Front.
