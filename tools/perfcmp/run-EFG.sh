#!/bin/zsh
cd /tmp/perfcmp
node realplay.mjs ours --speed 2 > /tmp/perfcmp/E-ours.out 2>&1
node realplay.mjs cc > /tmp/perfcmp/E-cc.out 2>&1
node cpuprof.mjs "ours-street-eye=http://127.0.0.1:5173/?shot=street-eye&frames=180" "ours-flood=http://127.0.0.1:5173/?shot=flood&frames=180" "cc-street=http://127.0.0.1:5190/?shot=street" > /tmp/perfcmp/F.out 2>&1
node measure.mjs --timestamps --runs 2 --seconds 5 --warm 3 --out /tmp/perfcmp/G-frozen.json \
  "frozen-flood=http://127.0.0.1:5181/?shot=flood&frames=180" \
  "frozen-street-eye=http://127.0.0.1:5181/?shot=street-eye&frames=180" > /tmp/perfcmp/G.out 2>&1
echo EXIT $? >> /tmp/perfcmp/G.out
