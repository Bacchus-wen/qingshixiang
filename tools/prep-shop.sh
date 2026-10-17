#!/bin/zsh
# Raw Tripo GLB -> web-ready shop model (decimated, 1K textures, KTX2: ETC1S colour/ORM, UASTC normal).
#   tools/prep-shop.sh <tripo4 op> <name> <size_m> <axis long|height|width|depth> <tris> [rotz_deg] [tex] [src.glb]
set -e
cd ~/Games/新游戏
OP=$1; NAME=$2; SIZE=$3; AXIS=$4; TRIS=$5; ROTZ=${6:-0}; TEX=${7:-1024}
SRC=${8:-assets/generated/tripo4/$OP/model.glb}
[ -f "$SRC" ] || SRC=assets/generated/tripo4/$OP/single.glb
B=/Applications/Blender.app/Contents/MacOS/Blender; G=~/Tools/bin/gltf-transform
TMP=/tmp/kscripts/prep/$NAME; mkdir -p /tmp/kscripts/prep
$B -b --factory-startup -P tools/blender/prep_model.py -- --in $SRC --out $TMP.glb --size $SIZE --axis $AXIS --tris $TRIS --rotz $ROTZ --tex $TEX 2>&1 | grep PREP
$G etc1s $TMP.glb $TMP.e.glb --slots "{baseColorTexture,metallicRoughnessTexture,occlusionTexture,emissiveTexture}" > /dev/null 2>&1
$G uastc $TMP.e.glb assets/models/shop/$NAME.glb --slots "normalTexture" > /dev/null 2>&1
ls -la assets/models/shop/$NAME.glb | awk '{print "OUT", $9, $5}'
