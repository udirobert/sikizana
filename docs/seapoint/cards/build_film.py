#!/usr/bin/env python3
"""Assemble the FinOps demo film: brand cards + screen take + recorded decision
beat + ElevenLabs VO + bed.

The arc is leak → hunt → doubt → human decides → logged. VO is placed on beats
verified frame-by-frame against the footage; every line is measured with
ffprobe and collision-checked, and the end card holds open for exactly as long
as the closing lines need.
"""
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent              # docs/seapoint/cards
REPO = HERE.parents[2]                              # repo root
VO = HERE.parent / "vo"
KEY = os.environ.get("ELEVENLABS_API_KEY")
if not KEY:
    sys.exit("ELEVENLABS_API_KEY is not set")

SIKI = "EXAVITQu4vr4xnSDxMaL"   # Sarah  — reassuring, plain English
ZANA = "IKne3meq5aSn9XLyUdCD"   # Charlie — direct, no panic

TAKE = Path.home() / "Downloads" / "sikizana-take1-silent.webm"
TAKE_USE = 60.0                 # the take's last ~11s is a static hold
CONFIRM = HERE / "confirm_cut.mp4"
BED = REPO / "sikizana-demo" / "assets" / "bgm" / "track.wav"
WHOOSH = REPO / "sikizana-demo" / "assets" / "sfx" / "whoosh.wav"

SEG0, SEGB = 4.5, 5.6           # card_B holds for Zana's line
TAIL_PAD = 1.0

# (voice, text, earliest film time it may start)
LINES = [
    (SIKI, "Same vendor. Same amount. Same bank reference, twenty-four hours apart. "
           "That sits in a ledger until something looks at it.", 0.4),
    (SIKI, "Sample books, and the app says so on screen. This is the owner's own review "
           "prompt, asked live. Look at the sidebar: net profit, minus two thousand seven "
           "hundred and five. That's the margin here.", 5.4),
    (SIKI, "I never told it which tools to run.", 26.0),
    (SIKI, "Two payments. Same reference. And it refuses to call it a duplicate.", 43.5),
    (SIKI, "It gives me the counter-explanation instead: a standing order can be a bulk "
           "payment covering several orders. So, ask the supplier for a statement of account.",
     50.5),
    (SIKI, "Six hundred and eighty pounds out, twice. Twelve hundred and fifty still owed to you.",
     58.2),
    (SIKI, "So the decision is mine. I mark it investigating.", 65.2),
    (SIKI, "Timestamped, with the finding id. A logged act, not a suggestion.", 71.0),
    (ZANA, "Siki can't change anything. Zana can't chase anyone, without you.", 75.6),
    (SIKI, "The payment run, with a control layer in front of it.", 81.0),
]


def tts(text, voice, out):
    if out.exists() and out.stat().st_size > 2000:
        return
    body = json.dumps({"text": text, "model_id": "eleven_multilingual_v2",
                       "voice_settings": {"stability": 0.5, "similarity_boost": 0.75}})
    # curl, not urllib: this Python build has no CA bundle to verify against.
    subprocess.run(
        ["curl", "-fsS", "--max-time", "90", "-o", str(out),
         f"https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_128",
         "-H", f"xi-api-key: {KEY}", "-H", "content-type: application/json", "-d", body],
        check=True)


def dur(path):
    return float(subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)]
    ).strip())


VO.mkdir(exist_ok=True)
clips = []
for i, (voice, text, at) in enumerate(LINES, 1):
    tag = hashlib.sha1(f"{voice}{text}".encode()).hexdigest()[:10]
    f = VO / f"v{tag}.mp3"
    tts(text, voice, f)
    clips.append((f, at, dur(f), text))

placed, cursor = [], 0.0
for i, (f, at, d, text) in enumerate(clips, 1):
    start = max(at, cursor + 0.3)
    placed.append((f, start, d, text))
    cursor = start + d
    print(f"  {i:2d} {start:6.2f}s +{d:4.2f}s  {text[:60]}")

tdur = min(dur(TAKE), TAKE_USE)
cdur = dur(CONFIRM)
t_start, b_start = SEG0, SEG0 + tdur
c_start = b_start + cdur
d_start = c_start + SEGB
segC = max(4.5, (cursor + TAIL_PAD) - d_start)
total = round(d_start + segC, 2)
print(f"film {total:.2f}s — take {t_start:.1f}-{b_start:.1f}, decision {b_start:.1f}-{c_start:.1f}, "
      f"B {c_start:.1f}-{d_start:.1f}, C {d_start:.1f}-{total:.1f}")

# ---- ffmpeg graph -----------------------------------------------------------
inputs = ["-i", str(HERE / "card_0.mp4"),
          "-t", str(tdur), "-i", str(TAKE),
          "-i", str(CONFIRM), "-i", str(HERE / "card_B.mp4"), "-i", str(HERE / "card_C.mp4")]
n = 5
for f, _, _, _ in placed:
    inputs += ["-i", str(f)]
n_vo = len(placed)
base_i = n + n_vo
bed_i = base_i + 1
extra = ["-f", "lavfi", "-t", f"{total}", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"]
if BED.exists():
    extra += ["-i", str(BED)]
if WHOOSH.exists():
    extra += ["-i", str(WHOOSH)]

FULL = ("scale=1920:1080:force_original_aspect_ratio=decrease,"
        "pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1")
fc = [
    "[0:v]fps=30,setsar=1,scale=1920:1080[v0]",
    f"[1:v]fps=30,{FULL}[v1]",
    "[2:v]fps=30,setsar=1,scale=1920:1080[v2]",
    f"[3:v]tpad=stop_mode=clone:stop_duration={SEGB - 3.5:.3f},fps=30,setsar=1,scale=1920:1080[v3]",
    f"[4:v]tpad=stop_mode=clone:stop_duration={segC - 4.5:.3f},fps=30,setsar=1,scale=1920:1080[v4]",
    "[v0][v1][v2][v3][v4]concat=n=5:v=1:a=0[outv]",
    f"[{base_i}:a]atrim=0:{total},asetpts=PTS-STARTPTS,aresample=48000[base]",
]
mix = ["[base]"]
for idx, (_, start, _, _) in enumerate(placed):
    ms = int(start * 1000)
    fc.append(f"[{n + idx}:a]aresample=48000,aformat=channel_layouts=stereo,"
              f"adelay={ms}|{ms},volume=1.8[a{idx}]")
    mix.append(f"[a{idx}]")
n_mix = len(mix)
if BED.exists():
    fc.append(f"[{bed_i}:a]atrim=0:{total},asetpts=PTS-STARTPTS,aresample=48000,"
              f"aformat=channel_layouts=stereo,volume=0.10,"
              f"afade=t=in:st=0:d=1.5,afade=t=out:st={total - 2.5}:d=2.5[bed]")
    mix.append("[bed]")
    n_mix += 1
if WHOOSH.exists():
    hits = [(b_start - 0.30, 0.45), (c_start - 0.35, 0.60), (d_start - 0.35, 0.70)]
    sfx_i = bed_i + 1
    fc.append(f"[{sfx_i}:a]asplit={len(hits)}" + "".join(f"[sp{k}]" for k in range(len(hits))))
    for j, (at, vol) in enumerate(hits):
        w = int(at * 1000)
        fc.append(f"[sp{j}]atrim=0:2,asetpts=PTS-STARTPTS,aresample=48000,"
                  f"aformat=channel_layouts=stereo,adelay={w}|{w},volume={vol}[sfx{j}]")
        mix.append(f"[sfx{j}]")
        n_mix += 1
fc.append("".join(mix) + f"amix=inputs={n_mix}:duration=first:normalize=0,"
                        f"alimiter=limit=0.94:level=false[outa]")

out = HERE / "sikizana-finops-final.mp4"
cmd = (["ffmpeg", "-y", "-v", "error", "-stats"] + inputs + extra +
       ["-filter_complex", ";".join(x for x in fc if x), "-map", "[outv]", "-map", "[outa]",
        "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart",
        "-t", f"{total}", str(out)])
subprocess.run(cmd, check=True)
print(f"→ {out}  {out.stat().st_size / 1e6:.1f} MB · {dur(out):.1f}s")
