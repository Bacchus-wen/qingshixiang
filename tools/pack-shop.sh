#!/bin/bash
# Web pack for a prepared shop model (assets/generated/shop/prep/<name>.glb, JPEG textures from prep_model.py):
# KTX2 textures (ETC1S colour/ORM, UASTC normals), optional max texture size, meshopt geometry compression.
#   tools/pack-shop.sh <name> [max_tex_px]      -> assets/models/shop/<name>.glb
set -e
cd "$HOME/Games/新游戏"
N=$1; R=${2:-}; G=~/Tools/bin/gltf-transform; T=/tmp/kscripts/pack; mkdir -p $T
RS=(); [ -n "$R" ] && RS=(--resize "$R")
$G etc1s assets/generated/shop/prep/$N.glb $T/$N.a.glb --slots "{baseColorTexture,metallicRoughnessTexture,occlusionTexture,emissiveTexture}" "${RS[@]}" > /dev/null 2>&1
$G uastc $T/$N.a.glb $T/$N.b.glb --slots "normalTexture" "${RS[@]}" > /dev/null 2>&1
$G meshopt $T/$N.b.glb assets/models/shop/$N.glb --level medium > /dev/null 2>&1
ls -la assets/models/shop/$N.glb | awk '{printf "PACK %s %.2f MB\n", $9, $5/1048576}'
