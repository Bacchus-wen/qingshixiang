#!/bin/zsh
cd /tmp/perfcmp
B=http://127.0.0.1:5173/?shot=flood\&frames=180
S=http://127.0.0.1:5173/?shot=street-eye\&frames=180
node measure.mjs --timestamps --nofootprint --runs 1 --seconds 5 --warm 3 --out /tmp/perfcmp/J2-recheck.json \
  "k-base-a=$B" "k-novol=$B&novol" "k-nossr=$B&pfx=nossr" "k-noao=$B&pfx=noao" "k-noghosts=$B&skip=ghosts" "k-noclustered=$B&noclustered" \
  "k-sbase-a=$S" "k-snovol=$S&novol" "k-snodof=$S&pfx=nodof" "k-snomodules=$S&nomodules" "k-sbase-b=$S" "k-base-b=$B" > /tmp/perfcmp/J2.out 2>&1
echo EXIT $? >> /tmp/perfcmp/J2.out
