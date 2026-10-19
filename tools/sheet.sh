#!/bin/bash
# Tile images into one contact sheet: tools/sheet.sh out.jpg COLS WIDTH img1 img2 ...   (each scaled to WIDTH px wide,
# label = file name burnt in at the top left)
OUT=$1; COLS=$2; W=$3; shift 3
N=$#; ROWS=$(( (N + COLS - 1) / COLS ))
ARGS=(); F=""; i=0
FONT=/System/Library/Fonts/Supplemental/Arial.ttf
for f in "$@"; do
  ARGS+=(-i "$f")
  lbl=$(basename "$f" | sed 's/\.[a-z]*$//; s/[:\\]/_/g')
  F+="[$i:v]scale=${W}:-2,drawtext=fontfile=$FONT:text='$lbl':x=8:y=8:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.6[v$i];"
  i=$((i+1))
done
# pad with black tiles so the grid is full
H=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$1" | awk -F, -v w=$W '{printf "%d", int($2*w/$1/2)*2}')
while [ $i -lt $((ROWS*COLS)) ]; do F+="color=c=black:s=${W}x${H}:d=1[v$i];"; i=$((i+1)); done
L=""; for ((r=0; r<ROWS; r++)); do for ((c=0; c<COLS; c++)); do L+="[v$((r*COLS+c))]"; done; done
LAYOUT=""; for ((r=0; r<ROWS; r++)); do for ((c=0; c<COLS; c++)); do LAYOUT+="$((c*W))_$((r*H))|"; done; done
F+="${L}xstack=inputs=$((ROWS*COLS)):layout=${LAYOUT%|}[out]"
ffmpeg -v error -y "${ARGS[@]}" -filter_complex "$F" -map "[out]" -frames:v 1 -q:v 3 "$OUT"
