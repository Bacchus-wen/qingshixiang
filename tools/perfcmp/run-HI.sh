#!/bin/zsh
cd /tmp/perfcmp
node ctl-resize.mjs > /tmp/perfcmp/H.out 2>&1
B=http://127.0.0.1:5173/?shot=flood\&frames=180
S=http://127.0.0.1:5173/?shot=street-eye\&frames=180
P='novol&pfx=nodof&nomodules&noeyeshadow'
node measure.mjs --timestamps --nofootprint --runs 1 --seconds 5 --warm 3 --out /tmp/perfcmp/I-plan.json \
  "i-flood-base=$B" \
  "i-flood-plan=$B&$P" \
  "i-flood-plan-1600@1@1600x900=$B&$P" \
  "i-flood-qlow-plan=$B&q=low&$P" \
  "i-street-base=$S" \
  "i-street-plan=$S&$P" \
  "i-flood-base2=$B" > /tmp/perfcmp/I.out 2>&1
echo EXIT $? >> /tmp/perfcmp/I.out
