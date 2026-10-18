#!/bin/bash
# Route comparison (2026-10-18, user-approved): the same two reference images through the Tripo open API and the
# Tripo CLI (Studio account), same settings: single image, v3.1-20260211, geometry detailed, texture detailed, PBR.
# Logs time and the balance before/after each task to assets/generated/compare/<route>/log.tsv. Never resubmits.
#   tools/tripo-compare.sh api | cli
cd "$HOME/Games/新游戏"
R=assets/generated/shop/refs; OUT=assets/generated/compare/$1; mkdir -p $OUT; LOG=$OUT/log.tsv
api_bal() { ASSET_TRIPO_KEYCHAIN_SERVICE='game-assets.tripo' ASSET_TRIPO_KEYCHAIN_ACCOUNT='default' python3 -I -c "
import sys, json; sys.path.insert(0, '/Users/wenbin/Desktop/游戏产线配置/tools'); import tripo_api as T
r = T.TripoClient(T._cli_credential(), timeout=30)._api('GET', '/account/balance'); d = r.get('data', r); print(d.get('balance'), d.get('frozen'))"; }
cli_bal() { tripo account balance --output-format json 2>/dev/null | python3 -c "import sys, json; print(json.load(sys.stdin)[\"wallet\"][\"total_credit\"])"; }
for s in radio:tube_radio_open robot:robot_full; do
  n=${s%%:*}; img=$R/${s#*:}.png
  [ -f $OUT/$n.glb ] && { echo "skip $n (exists)"; continue; }
  b0=$([ $1 = api ] && api_bal || cli_bal); t0=$(date +%s)
  if [ $1 = api ]; then
    ASSET_TRIPO_KEYCHAIN_SERVICE='game-assets.tripo' ASSET_TRIPO_KEYCHAIN_ACCOUNT='default' python3 tools/tripo4.py single cmp_api_$n $img --plain > $OUT/$n.out 2>&1
    g=$(ls assets/generated/tripo4/cmp_api_$n/single.glb 2>/dev/null) && cp "$g" $OUT/$n.glb
  else
    tripo generate image $img --model-version v3.1-20260211 --geometry-quality detailed --texture-quality detailed --pbr \
      --visibility private --format glb --output $OUT/$n.glb --timeout 40m --output-format json > $OUT/$n.out 2>&1
  fi
  t1=$(date +%s); b1=$([ $1 = api ] && api_bal || cli_bal)
  printf "%s\t%s\tstart %s\tseconds %s\tbalance_before %s\tbalance_after %s\tglb %s\n" "$1" "$n" "$(date -r $t0 '+%H:%M:%S')" $((t1 - t0)) "$b0" "$b1" "$(ls -la $OUT/$n.glb 2>/dev/null | awk '{print $5}')" | tee -a $LOG
done
