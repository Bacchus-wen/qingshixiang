#!/bin/zsh
cd /tmp/perfcmp
B=http://127.0.0.1:5173/?shot=flood\&frames=180
node measure.mjs --uncap --runs 2 --seconds 5 --warm 3 --out /tmp/perfcmp/BC-uncap.json \
  "ours-flood=$B" \
  "ours-street-eye=http://127.0.0.1:5173/?shot=street-eye&frames=180" \
  "cc-street=http://127.0.0.1:5190/?shot=street" \
  "abl-nodof@1=$B&pfx=nodof" \
  "abl-nossr@1=$B&pfx=nossr" \
  "abl-noao@1=$B&pfx=noao" \
  "abl-noscatter@1=$B&pfx=noscatter" \
  "abl-notraa@1=$B&pfx=notraa" \
  "abl-qlow@1=$B&q=low" \
  "abl-nomodules@1=$B&nomodules" \
  "abl-noghosts@1=$B&skip=ghosts" \
  "abl-norain@1=$B&skip=rain" \
  "abl-noclustered@1=$B&noclustered" \
  "abl-noeyeshadow@1=$B&noeyeshadow" \
  "abl-combo@1=$B&pfx=nodof,noao,noscatter&nomodules&noeyeshadow" \
  "ours-flood-again@1=$B" > /tmp/perfcmp/BC.out 2>&1
echo EXIT $? >> /tmp/perfcmp/BC.out
