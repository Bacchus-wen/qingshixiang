#!/bin/bash
# assets/models/shop/lod/index.json: the models that have a finished LOD set (the shop loads these as LOD, others as before)
cd "$HOME/Games/新游戏/assets/models/shop/lod" && python3 -c "
import json, os
names = sorted(d for d in os.listdir('.') if os.path.isfile(os.path.join(d, 'lod.json')) and not d.startswith('probe'))
json.dump(names, open('index.json', 'w')); print(len(names), names)"
