#!/bin/bash
# Room/decal textures -> KTX2 (GPU-compressed: ~1 byte/px on the GPU instead of 4, with mipmaps).
# Encoded bottom-up (--lower_left_maps_to_s0t0) so three.js plane/world UVs (v up) show them upright.
# Rough tileables and pictures: ETC1S (small download); the floor and anything with text: UASTC + zstd (crisp).
#   tools/tex-ktx2.sh      (reads assets/generated/shop/tex_ready/*.png, writes assets/textures/shop/*.ktx2)
set -e
cd "$HOME/Games/新游戏"
SRC=assets/generated/shop/tex_ready; OUT=assets/textures/shop
e1() { toktx --t2 --lower_left_maps_to_s0t0 --encode etc1s --clevel 4 --qlevel 230 --genmipmap --assign_oetf srgb ${3:+--resize $3} $OUT/$1.ktx2 $SRC/$2.png; }
ua() { toktx --t2 --lower_left_maps_to_s0t0 --encode uastc --uastc_quality 2 --uastc_rdo_l 2 --zcmp 18 --genmipmap --assign_oetf srgb ${3:+--resize $3} $OUT/$1.ktx2 $SRC/$2.png; }
e1 wall_upper wall_upper; e1 wall_dado wall_dado; e1 ceiling ceiling; e1 facade facade; e1 pavement pavement; e1 shutter shutter; e1 cardboard cardboard 512x512
e1 floor_terrazzo floor_terrazzo
e1 poster poster 512x1024; e1 box_a box_a 512x512; e1 box_b box_b 512x512; e1 box_c box_c 512x512; e1 box_d box_d 512x512
ua calendar calendar 512x1024; ua price_list price_list 512x1024; ua slogan slogan 1024x512; ua sign_main sign_main 1024x512; ua sign_side sign_side 512x1024; ua tags tags 1024x1024

# second wall batch (the business licence was generated but is not used: it carries the state emblem)
e1 tv_poster tv_poster 512x1024; ua notice notice 512x1024
# the other side of the street (matte painting seen through the opening)
e1 street_backdrop street_backdrop 2048x1024
# sandwich-board sign at the entrance
ua sign_aframe sign_aframe 512x1024
# pencil height marks beside the back door (drawn as a multiply decal, so only the marks show)
ua height_marks height_marks 512x1024
# vertical 家电维修 board on the left pillar (the photo's grey surround is cropped by UVs)
ua sign_vertical sign_vertical 512x1024
# bare pegboard (tiled from the print's empty strip): every tool on it is geometry
e1 pegboard_empty pegboard_empty 1024x512
ls -la $OUT/*.ktx2 | awk '{s+=$5} END {print "total", s}'
