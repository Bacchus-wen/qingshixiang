#!/bin/bash
# Build every model in tools/lod-models.json with tools/lod-build.mjs, three at a time. Log: /tmp/lod-all.log
cd "$HOME/Games/新游戏"
python3 -c "
import json
for m in json.load(open('tools/lod-models.json'))['models']:
    print(m['name'], m['in'], m['size'], m.get('axis', 'long'), m.get('rotz', 0), m.get('levels', '0.5:2048,2:1024,6:512'))
" | while read n i s a r l; do
  [ -n "$ONLY" ] && ! echo ",$ONLY," | grep -q ",$n," && continue
  [ -f assets/models/shop/lod/$n/lod.json ] && [ -z "$FORCE" ] && { echo "skip $n"; continue; }
  echo "$n $i $s $a $r $l"
done | xargs -P 3 -L 1 bash -c 'tools/lod.sh --name $0 --in $1 --size $2 --axis $3 --rotz $4 --levels $5 2>&1 | grep -E "^(LOD|  L|  skip|  wrote|[a-z_]+: raw)" ; echo "DONE $0"'
