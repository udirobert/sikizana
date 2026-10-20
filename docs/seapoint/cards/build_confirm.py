#!/usr/bin/env python3
"""Cut the recorded confirm beat into a 1920x1080 insert with two punch-ins.

Segments are the real interaction; the crops only move the camera closer.
"""
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = Path("/tmp/rec/confirm.webm")
OUT = HERE / "confirm_cut.mp4"

FULL = ("scale=1920:1080:force_original_aspect_ratio=decrease,"
        "pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1")
SEGS = [
    ("full", 3.6, 5.6, None),                        # cursor in, click Investigate
    ("crop", 5.6, 8.2, "crop=720:405:200:470"),      # pill appears, click it
    ("full", 8.2, 9.8, None),                        # land on /activity
    ("crop", 9.8, 14.0, "crop=800:450:300:120"),     # the logged row
]

inputs, fc, order = [], [], []
for i, (kind, a, b, crop) in enumerate(SEGS):
    inputs += ["-ss", str(a), "-to", str(b), "-i", str(SRC)]
    tail = f"{crop},scale=1920:1080,setsar=1" if kind == "crop" else FULL
    fc.append(f"[{i}:v]fps=30,{tail}[s{i}]")
    order.append(f"[s{i}]")
fc.append("".join(order) + f"concat=n={len(SEGS)}:v=1:a=0[v]")

subprocess.run(
    ["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", ";".join(fc),
     "-map", "[v]", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
     "-pix_fmt", "yuv420p", "-an", str(OUT)], check=True)
d = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                             "-of", "csv=p=0", str(OUT)]).strip().decode()
print(f"→ {OUT} {float(d):.2f}s")
