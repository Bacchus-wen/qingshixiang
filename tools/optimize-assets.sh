#!/bin/sh
# Shrink exported assets in place (safe to re-run): glb dedup + weld (NO quantize: our loaders transform
# geometry on the CPU and Int16 positions would break), and re-encode JPEG textures if that makes them smaller.
cd "$(dirname "$0")/../assets" || exit 1
GT="$HOME/Tools/bin/gltf-transform"
for f in models/*.glb models/*/*.glb; do
  [ -f "$f" ] || continue
  "$GT" dedup "$f" /tmp/_opt_a.glb >/dev/null 2>&1 && "$GT" weld /tmp/_opt_a.glb /tmp/_opt_b.glb >/dev/null 2>&1 \
    && [ "$(stat -f%z /tmp/_opt_b.glb)" -lt "$(stat -f%z "$f")" ] && mv /tmp/_opt_b.glb "$f"
done
for f in textures/*/*.jpg; do
  ffmpeg -v error -y -i "$f" -q:v 6 /tmp/_opt.jpg && [ "$(stat -f%z /tmp/_opt.jpg)" -lt "$(stat -f%z "$f")" ] && mv /tmp/_opt.jpg "$f"
done
du -sh . | sed 's/^/assets total: /'
