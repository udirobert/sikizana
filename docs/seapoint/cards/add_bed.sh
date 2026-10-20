#!/bin/bash
# Lay a quiet music bed + one whoosh under the assembled demo.
#   ./add_bed.sh <in.mp4> <handoff-seconds> [out.mp4]
set -euo pipefail
cd "$(dirname "$0")"
IN="${1:?}"; SPLIT="${2:?}"; OUT="${3:-final-audio.mp4}"
BGM=../../../sikizana-demo/assets/bgm/track.wav
SFX=../../../sikizana-demo/assets/sfx/whoosh.wav
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$IN" | cut -d. -f1)
ffmpeg -y -v error -i "$IN" -stream_loop -1 -i "$BGM" -i "$SFX" -filter_complex "
  [1:a]atrim=0:${DUR},afade=t=in:st=0:d=1.2,afade=t=out:st=$(python3 -c "print(${DUR}-1.5)"):d=1.5,volume=0.10[bed];
  [2:a]adelay=$(python3 -c "print(int(${SPLIT}*1000)-300)")|$(python3 -c "print(int(${SPLIT}*1000)-300)"),volume=0.55[sfx];
  [0:a][bed][sfx]amix=inputs=3:duration=first:dropout_transition=0:normalize=0[aout]
" -map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 160k "$OUT"
echo "→ $OUT"
