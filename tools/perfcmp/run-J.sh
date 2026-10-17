#!/bin/zsh
cd /tmp/perfcmp
B=http://127.0.0.1:5173/?shot=flood\&frames=180
node measure.mjs --timestamps --nofootprint --runs 1 --seconds 5 --warm 3 --out /tmp/perfcmp/J-recheck.json \
  "j-base-a=$B" "j-flatmat=$B&flatmat" "j-720p@1@1280x720=$B" "j-noeyeshadow=$B&noeyeshadow" \
  "j-noscatter=$B&pfx=noscatter" "j-notraa=$B&pfx=notraa" "j-nodof=$B&pfx=nodof" "j-norain=$B&skip=rain" \
  "j-nomodules=$B&nomodules" "j-qlow=$B&q=low" "j-base-b=$B" > /tmp/perfcmp/J.out 2>&1
echo EXIT $? >> /tmp/perfcmp/J.out
