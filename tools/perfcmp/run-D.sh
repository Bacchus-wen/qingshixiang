#!/bin/zsh
cd /tmp/perfcmp
B=http://127.0.0.1:5173/?shot=flood\&frames=180
S=http://127.0.0.1:5173/?shot=street-eye\&frames=180
node measure.mjs --timestamps --runs 2 --seconds 5 --warm 3 --out /tmp/perfcmp/D-ts.json \
  "ours-flood=$B" \
  "ours-street-eye=$S" \
  "cc-street=http://127.0.0.1:5190/?shot=street" \
  "cc-overlook@1=http://127.0.0.1:5190/?shot=overlook" \
  "f-novol@1=$B&novol" \
  "f-nodof@1=$B&pfx=nodof" \
  "f-nossr@1=$B&pfx=nossr" \
  "f-noao@1=$B&pfx=noao" \
  "f-noscatter@1=$B&pfx=noscatter" \
  "f-notraa@1=$B&pfx=notraa" \
  "f-qlow@1=$B&q=low" \
  "f-nomodules@1=$B&nomodules" \
  "f-noeyeshadow@1=$B&noeyeshadow" \
  "f-norain@1=$B&skip=rain" \
  "f-noghosts@1=$B&skip=ghosts" \
  "f-flatmat@1=$B&flatmat" \
  "f-combo@1=$B&novol&pfx=nodof,noao,noscatter&nomodules&noeyeshadow" \
  "f-720p@1@1280x720=$B" \
  "s-novol@1=$S&novol" \
  "s-qlow@1=$S&q=low" \
  "s-720p@1@1280x720=$S" \
  "ours-flood-again@1=$B" > /tmp/perfcmp/D.out 2>&1
echo EXIT $? >> /tmp/perfcmp/D.out
