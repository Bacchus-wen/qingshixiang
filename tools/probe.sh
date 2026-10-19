#!/bin/bash
# tools/probe.sh <model> <outdir> [args...]: run tools/model-probe.mjs with the shared node modules (~/Tools/node)
exec node --preserve-symlinks --preserve-symlinks-main "$HOME/Tools/node/model-probe.mjs" "$@"
