#!/bin/sh
# Run from the project root. Source assets stay untouched; output is <= 2048px, JPEG q90.
set -eu
mkdir -p assets/textures/cc assets/models/cc
for name in atlas_albedo atlas_normal interior_atlas shelves shutter; do
  source="reference/cybercity/assets/textures/buildings/$name.png"
  largest=$(sips -g pixelWidth -g pixelHeight "$source" | awk '/pixelWidth|pixelHeight/ { if ($2 > m) m=$2 } END { print m }')
  if [ "$largest" -gt 2048 ]; then
    sips -s format jpeg -s formatOptions 90 -Z 2048 "$source" --out "assets/textures/cc/$name.jpg" >/dev/null
  else
    sips -s format jpeg -s formatOptions 90 "$source" --out "assets/textures/cc/$name.jpg" >/dev/null
  fi
done
# Kitchen only: omit Japanese menu boards, banners, prices and the daruma ornament.
ffmpeg -hide_banner -loglevel error -y -i reference/cybercity/assets/textures/buildings/shop_ramen.png -vf 'crop=1160:650:240:340' -frames:v 1 assets/textures/cc/kitchen-crop.png
sips -s format jpeg -s formatOptions 90 assets/textures/cc/kitchen-crop.png --out assets/textures/cc/shop_ramen.jpg >/dev/null
rm assets/textures/cc/kitchen-crop.png
cp reference/cybercity/assets/models/buildings/ac_unit.glb assets/models/cc/ac_unit.glb
