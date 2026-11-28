#!/usr/bin/env python3
"""Build the small, local Dot Front sound bank from licensed field recordings.

Optional developer tool; not part of site builds or browser runtime.
Requires Python 3, numpy, scipy and ffmpeg. Run:
  python scripts/build-dot-front-audio.py --source-dir /tmp/dot-front-audio-src
Add --download to fetch missing source files from their recorded public URLs.
"""
import argparse
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import subprocess
import urllib.request
import zipfile

import numpy as np
from scipy.signal import butter, resample_poly, sosfilt

RATE = 44100
SOURCES = {
    "gunshots.zip": "https://opengameart.org/sites/default/files/sounds.zip",
    "fireworks.zip": "https://opengameart.org/sites/default/files/25-CC0-bang-sfx.zip",
    "wind.wav": "https://opengameart.org/sites/default/files/wind%20background%20noise%202.wav",
}
SOURCE_SHA256 = {
    "gunshots.zip": "5b3960083a94e18ee47bc84376615a476debc884b18f25b93ea4b6ab3f278e4f",
    "fireworks.zip": "c0c9ecc11e2dc0d190f0cced755569858234b8528286bc83becb6314c663407f",
    "wind.wav": "9f1fd5c8b37949e6889a7f6acbd822f66e0ab4e918d72bda58d8d8c2c7e85a80",
}


def decode(data, channels=1, rate=RATE):
    return np.frombuffer(subprocess.check_output([
        "ffmpeg", "-v", "error", "-i", "pipe:0", "-f", "f32le", "-ac", str(channels), "-ar", str(rate), "pipe:1"
    ], input=data), dtype="<f4").reshape(-1, channels).astype(np.float64)


def filt(samples, high=50, low=7000):
    result = samples.copy()
    if high:
        result = sosfilt(butter(2, high, btype="highpass", fs=RATE, output="sos"), result, axis=0)
    if low:
        result = sosfilt(butter(4, low, btype="lowpass", fs=RATE, output="sos"), result, axis=0)
    return result


def pitch(samples, speed):
    fraction = Fraction(1 / speed).limit_denominator(100)
    return resample_poly(samples, fraction.numerator, fraction.denominator, axis=0)


def fade(samples, attack=.002, release=.13):
    result = samples.copy()
    front = min(len(result), round(attack * RATE))
    back = min(len(result), round(release * RATE))
    if front:
        result[:front] *= np.linspace(0, 1, front)[:, None]
    if back:
        result[-back:] *= np.linspace(1, 0, back)[:, None]
    return result


def normalize(samples, peak=.78):
    return samples * (peak / max(float(np.max(np.abs(samples))), 1e-9))


def trim_attack(samples):
    loud = np.flatnonzero(np.max(np.abs(samples), axis=1) >= np.max(np.abs(samples)) * .08)
    return samples[max(0, int(loud[0]) - round(.003 * RATE)):] if len(loud) else samples


def event(samples, center, seconds=.8):
    cut = samples[max(0, round((center - .055) * RATE)):round((center + seconds) * RATE)].copy()
    threshold = np.max(np.abs(cut)) * .12
    loud = np.flatnonzero(np.max(np.abs(cut), axis=1) >= threshold)
    if len(loud):
        cut = cut[max(0, int(loud[0]) - round(.003 * RATE)):]
    return fade(cut)


def mix(layers, seconds):
    result = np.zeros((round(seconds * RATE), 1))
    for samples, offset, gain in layers:
        start = round(offset * RATE)
        length = min(len(samples), len(result) - start)
        if length > 0:
            result[start:start + length] += samples[:length] * gain
    return result


def add_loop(loop, samples, at, gain, pan):
    samples = samples[:, 0] * gain
    left, right = np.sqrt((1 - pan) / 2), np.sqrt((1 + pan) / 2)
    positions = (np.arange(len(samples)) + round(at * RATE)) % len(loop)
    np.add.at(loop[:, 0], positions, samples * left)
    np.add.at(loop[:, 1], positions, samples * right)


def encode(samples, path, stereo=False):
    rate = 22050 if stereo else RATE
    subprocess.run([
        "ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(RATE), "-ac", str(samples.shape[1]),
        "-i", "pipe:0", "-map_metadata", "-1", "-c:a", "libmp3lame", "-b:a", "80k" if stereo else "96k",
        "-ar", str(rate), "-write_xing", "1", str(path)
    ], input=samples.astype("<f4").tobytes(), check=True)
    decoded = decode(path.read_bytes(), samples.shape[1], rate)
    peak = float(np.max(np.abs(decoded)))
    true_peak = float(np.max(np.abs(resample_poly(decoded, 4, 1, axis=0))))
    rms = float(np.sqrt(np.mean(decoded ** 2)))
    if not .001 < peak < .98 or true_peak >= .98 or rms <= .0001:
        raise ValueError(f"Invalid level in {path.name}: peak={peak}, rms={rms}")
    start_energy = np.sqrt(np.mean(decoded[:max(1, round(.02 * rate))] ** 2))
    if not stereo and start_energy <= .008:
        raise ValueError(f"Attack is too late in {path.name}")
    loop = decoded[rate:25 * rate] if stereo else decoded
    seam = float(np.max(np.abs(loop[-1] - loop[0])))
    if stereo and seam > .025:
        raise ValueError(f"Loop seam is too large: {seam}")
    if stereo:
        block = round(rate * .1)
        windows = loop[:len(loop) // block * block].reshape(-1, block, samples.shape[1])
        minimum = float(np.min(np.sqrt(np.mean(windows ** 2, axis=(1, 2)))))
        if minimum <= .001:
            raise ValueError(f"The ambience loop has a silent gap: {minimum}")
    return {"file": path.name, "url": f"/dot-front/audio/{path.name}", "bytes": path.stat().st_size,
            "decodedSeconds": round(len(decoded) / rate, 6), "sampleRate": rate, "channels": samples.shape[1],
            "peakDbFS": round(20 * np.log10(peak), 2), "truePeak4xDbFS": round(20 * np.log10(true_peak), 2),
            "rmsDbFS": round(20 * np.log10(rms), 2),
            "first20msRms": round(float(start_energy), 6), "loop": stereo,
            **({"loopStart": 1, "loopEnd": 25, "loopSeconds": 24, "minimumLoop100msRms": round(minimum, 6)} if stereo else {}),
            "license": "CC-BY-3.0" if path.name in ["light-shot.mp3", "light-shot-2.mp3", "ambience.mp3"] else "CC0-1.0",
            "loopSeamAmplitude": round(seam, 7), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=Path("/tmp/dot-front-audio-src"))
    parser.add_argument("--download", action="store_true")
    args = parser.parse_args()
    args.source_dir.mkdir(parents=True, exist_ok=True)
    for name, url in SOURCES.items():
        target = args.source_dir / name
        if not target.exists() and args.download:
            urllib.request.urlretrieve(url, target)
        if not target.exists():
            raise FileNotFoundError(f"Missing {target}; use --download or supply the documented source file")
        if hashlib.sha256(target.read_bytes()).hexdigest() != SOURCE_SHA256[name]:
            raise ValueError(f"Source checksum changed: {name}; review licensing and source changes before rebuilding")
    with zipfile.ZipFile(args.source_dir / "gunshots.zip") as archive:
        sks = decode(archive.read("sounds/sks.wav"))
        mosin = decode(archive.read("sounds/mosin.wav"))
    with zipfile.ZipFile(args.source_dir / "fireworks.zip") as archive:
        fireworks = {name: decode(archive.read(name + ".ogg")) for name in
                     ["cannon_01", "cannon_02", "fw_04", "bang_05", "bang_09", "shot_03"]}

    # Three close-microphone rifle attacks and their natural field reflections.
    rifles = [normalize(filt(event(sks, time, .64), 85, 9200), .66) for time in [.4, 2.35, 3.39]]
    light = normalize(fade(mix([(rifles[0], 0, 1), (rifles[1], .115, .76), (rifles[2], .238, .83)], 1.03)), .78)
    rifle_alt = normalize(filt(event(mosin, 3.6, .72), 85, 8500), .68)
    light2 = normalize(fade(mix([(pitch(rifles[2], 1.025), 0, 1), (rifle_alt, .135, .72)], 1.02)), .78)

    # Recorded firework pressure wave + slower recorded debris/reverberation body.
    cannon_a = normalize(filt(pitch(fireworks["cannon_02"], .83), 38, 5400), .72)
    cannon_b = normalize(filt(pitch(fireworks["cannon_01"], .76), 38, 4900), .72)
    body = normalize(filt(pitch(fireworks["fw_04"], .8), 42, 1800), .5)
    tail = normalize(filt(pitch(fireworks["bang_05"], .72), 55, 2400), .42)
    heavy = normalize(fade(trim_attack(mix([(cannon_a, 0, 1), (body, .045, .5)], 2.85)), .002, .28), .79)
    heavy2 = normalize(fade(trim_attack(mix([(cannon_b, 0, 1), (tail, .065, .55)], 2.32)), .002, .3), .79)
    hit = normalize(fade(trim_attack(filt(mix([(fireworks["bang_09"], 0, .75), (fireworks["shot_03"], .025, .2)], .48), 450, 8200)), .001, .18), .7)

    # Real open-air wind; the first three seconds crossfade from the original tail
    # into the head, preserving the natural seam from sample N-1 to sample N.
    wind = decode((args.source_dir / "wind.wav").read_bytes(), 2)
    wind = filt(wind[6 * RATE:33 * RATE], 65, 2900)
    wind *= .065 / max(float(np.sqrt(np.mean(wind ** 2))), 1e-9)
    size, overlap = 24 * RATE, 3 * RATE
    ambience = wind[:size].copy()
    blend = ((1 - np.cos(np.linspace(0, np.pi, overlap))) / 2)[:, None]
    ambience[:overlap] = wind[size:size + overlap] * (1 - blend) + wind[:overlap] * blend
    distant_a = normalize(filt(light, 100, 1150), .3)
    distant_b = normalize(filt(heavy, 55, 700), .32)
    for at, gain, pan in [(2.8, .65, -.55), (10.9, .5, .42), (17.1, .62, -.3), (22.8, .4, .6)]:
        add_loop(ambience, distant_a, at, gain, pan)
    for at, gain, pan in [(6.8, .58, .25), (19.6, .48, -.45)]:
        add_loop(ambience, distant_b, at, gain, pan)
    if np.max(np.abs(ambience)) > .7:
        ambience = normalize(ambience, .7)
    # Loop only [1,25] seconds; cyclic guards isolate MP3 decoder start/end padding.
    ambience = np.concatenate([ambience[-RATE:], ambience, ambience[:RATE]])

    output = Path(__file__).resolve().parent.parent / "public/dot-front/audio"
    output.mkdir(parents=True, exist_ok=True)
    assets = []
    for name, samples in [("light-shot.mp3", light), ("light-shot-2.mp3", light2), ("heavy-shot.mp3", heavy),
                          ("heavy-shot-2.mp3", heavy2), ("impact.mp3", hit), ("ambience.mp3", ambience)]:
        assets.append(encode(samples, output / name, stereo=name == "ambience.mp3"))
    report = {"generatedBy": "scripts/build-dot-front-audio.py", "sourceRecordings": [
        {"file": name, "url": url, "sha256": hashlib.sha256((args.source_dir / name).read_bytes()).hexdigest()}
        for name, url in SOURCES.items()], "assets": assets, "totalBytes": sum(asset["bytes"] for asset in assets),
        "checks": {"allDecoded": True, "peakBelow098": True, "truePeak4xBelow098": True, "nonSilent": True, "effectAttackWithin20ms": True,
                   "ambienceLoopCrossfaded": True, "ambienceSeamBelow0025": True, "ambienceHasNoSilent100msBlocks": True}}
    (output / "manifest.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
