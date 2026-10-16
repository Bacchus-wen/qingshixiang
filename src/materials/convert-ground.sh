#!/bin/sh
# Run from the project root. No source mutation. JPEG quality 88, max edge 1024 (<=2048).
set -eu
src=reference/cybercity/assets/textures/ground
out=assets/textures/cc/ground
mkdir -p "$out"
convert() {
  limit=${3:-768}
  largest=$(sips -g pixelWidth -g pixelHeight "$1" | awk '/pixelWidth|pixelHeight/ { if ($2 > m) m=$2 } END { print m }')
  if [ "$largest" -gt "$limit" ]; then
    sips -s format jpeg -s formatOptions 88 -Z "$limit" "$1" --out "$2" >/dev/null
  else
    sips -s format jpeg -s formatOptions 88 "$1" --out "$2" >/dev/null
  fi
}
for name in asphalt_a asphalt_b sidewalk_tiles paint_wear manhole drain_grate; do
  convert "$src/${name}_c.png" "$out/${name}_c.jpg" 768
  convert "$src/${name}_n.png" "$out/${name}_n.jpg" 640
done
convert "$src/litter_atlas_a.png" "$out/litter_atlas_c.jpg" 1024
convert "$src/litter_atlas_n.png" "$out/litter_atlas_n.jpg" 768
# JPEG cannot retain RGBA; preserve the actual source alpha as linear mask data.
tmp="$out/.litter-alpha.png"
trap 'rm -f "$tmp"' EXIT HUP INT TERM
ffmpeg -hide_banner -loglevel error -y -i "$src/litter_atlas_a.png" -vf alphaextract -frames:v 1 "$tmp"
convert "$tmp" "$out/litter_atlas_mask.jpg" 1024
total=$(wc -c "$out"/*.jpg | awk 'END { print $1 }')
[ "$total" -le 6000000 ] || { echo "Ground texture budget exceeded: $total bytes" >&2; exit 1; }
echo "Ground textures: $total / 6000000 bytes (JPEG q88)"
