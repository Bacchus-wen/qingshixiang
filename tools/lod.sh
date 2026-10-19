#!/bin/bash
# run tools/lod-build.mjs with ~/Tools/node's modules (gltf-transform, meshoptimizer, sharp)
cd "$HOME/Games/新游戏" && exec node --preserve-symlinks --preserve-symlinks-main "$HOME/Tools/node/lod-build.mjs" "$@"
