#!/bin/zsh
cd /tmp/perfcmp
node measure.mjs --runs 2 --seconds 5 --warm 3 --out /tmp/perfcmp/A-vsync.json \
  "ours-flood=http://127.0.0.1:5173/?shot=flood&frames=180" \
  "ours-street-eye=http://127.0.0.1:5173/?shot=street-eye&frames=180" \
  "cc-street=http://127.0.0.1:5190/?shot=street" \
  "cc-overlook=http://127.0.0.1:5190/?shot=overlook" > /tmp/perfcmp/A.out 2>&1
echo EXIT $? >> /tmp/perfcmp/A.out
