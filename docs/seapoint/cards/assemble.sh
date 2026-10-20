#!/bin/bash
# Assemble the 2-minute FinOps demo: brand cards around your screen recording.
#   ./assemble.sh <screen.mp4> <handoff-seconds> [out.mp4]
# e.g. ./assemble.sh ~/Desktop/loom-recording.mp4 85 final.mp4
#
# Structure: card_0 (the mystery) → card_A (question) → screen[0:handoff] →
#            card_B (Siki→Zana) → screen[handoff:end] → card_C (lockup)
set -euo pipefail
cd "$(dirname "$0")"
SCREEN="${1:?need the screen recording}"; SPLIT="${2:?need the handoff timestamp in seconds}"; OUT="${3:-final.mp4}"
[ -f "$SCREEN" ] || { echo "no such file: $SCREEN"; exit 1; }

ffmpeg -y -v error -stats \
  -i card_0.mp4 -i card_A.mp4 -i "$SCREEN" -i card_B.mp4 -i card_C.mp4 \
  -filter_complex "
    [2:v]split=2[s1][s2];
    [2:a]asplit=2[a1][a2];
    [s1]trim=0:${SPLIT},setpts=PTS-STARTPTS,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=30[v1];
    [a1]atrim=0:${SPLIT},asetpts=PTS-STARTPTS[a1o];
    [s2]trim=${SPLIT},setpts=PTS-STARTPTS,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=30[v2];
    [a2]atrim=${SPLIT},asetpts=PTS-STARTPTS[a2o];
    [0:v]fps=30,setsar=1[v0]; [0:a]anull[a0];
    [1:v]fps=30,setsar=1[vA]; [1:a]anull[aA];
    [3:v]fps=30,setsar=1[vB]; [3:a]anull[aB];
    [4:v]fps=30,setsar=1[vC]; [4:a]anull[aC];
    [v0][a0][vA][aA][v1][a1o][vB][aB][v2][a2o][vC][aC]concat=n=6:v=1:a=1[outv][outa]
  " -map "[outv]" -map "[outa]" -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart "$OUT"

echo "→ $OUT  ($(du -h "$OUT" | cut -f1), $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT")s)"
echo "   Loom note: import this file, or upload it straight to the submission form."
