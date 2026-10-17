#!/bin/bash
# Final review stills of the repair shop at 1920x1080 into docs/snap-shop/, plus the side-by-side with the key art.
set -e
cd "$HOME/Games/新游戏"
mkdir -p docs/snap-shop
node tools/shot.mjs shop-establish shop-robotfull shop-robotface shop-bench shop-back shop-left shop-wide shop-rev shop-peg shop-chassis shop-marks --size 1920x1080 2>&1 | grep -v warning
for s in shop-establish shop-robotfull shop-robotface shop-bench shop-back shop-left shop-wide shop-rev shop-peg shop-chassis shop-marks; do
  ffmpeg -v error -y -i renders/$s.png -q:v 2 docs/snap-shop/${s#shop-}.jpg
done
K=assets/generated/shop/keyart
ffmpeg -v error -y -i $K/img_43683/ai_generate_43683_2.png -i renders/shop-establish.png -filter_complex "[0:v]scale=1920:1080[a];[1:v]scale=1920:1080[b];[a][b]vstack" -q:v 2 docs/snap-shop/vs-keyart.jpg
ffmpeg -v error -y -i assets/generated/shop/robot_design.png -i renders/shop-robotfull.png -filter_complex "[0:v]scale=-2:1080[a];[1:v]scale=-2:1080[b];[a][b]hstack" -q:v 2 docs/snap-shop/vs-robot-design.jpg
node tools/shop-gallery.mjs > /dev/null 2>&1 && cp renders/gallery/sheet.jpg docs/snap-shop/models-in-scene.jpg
ls -la docs/snap-shop | awk '{print $5, $9}'
