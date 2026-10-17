# Midjourney 提示词(第四版,2026-10-17)

用途:宣传 Tripo 模型。A 组是给 Tripo 建模用的**参考图**(要干净、完整);B 组是**氛围图**(定画面方向)。
生成后请把图放进 `~/Games/新游戏/assets/mj/`(文件名随意,最好带上 A1/A2/B1… 编号)。我挑好后把选中的图、Tripo 参数和积分发你确认,再提交建模。

## A 组:建模参考图(给 Tripo 用)
挑图标准:整个物体都在画面里、没被裁切;背景干净单色;没有地面投影和强烈反光;细节清楚。每条建议出 4 张里挑 1–2 张。
MJ 不认中文字,这里都写英文。

**A1 机器人全身(坐姿)**:身体用这张建模,头会在 Blender 里切掉、换成 A2 的高精度头。
```
full body of a broken old survey robot sitting on the ground, back resting against a wall, legs stretched forward, one forearm missing with cut cables hanging from the elbow, a single large mechanical camera eye on its head, chipped off-white ceramic armor plates over a dark steel skeleton, rust in the seams, exposed coolant hoses inside an open chest panel, worn industrial design, three-quarter front view, entire robot in frame, plain light grey background, soft even studio lighting, no cast shadow, product render, highly detailed --ar 1:1 --v 7 --style raw
```

**A2 机器人头(连机械眼)**:单独一件,头能转、眼睛能发光。
```
close-up of the head of a broken old survey robot, rounded off-white ceramic helmet with a dark visor band, one protruding mechanical camera eye with a brass lens barrel, iris aperture blades and a cracked glass lens, chipped paint, rust streaks, small antenna stub, three-quarter view, whole head in frame, plain light grey background, soft even studio lighting, product render, highly detailed --ar 1:1 --v 7 --style raw
```

**A3(可选)机器人正侧面**:如果 A1 的设计满意,用 MJ 的参考图功能(把 A1 选中的图拖进去做 omni reference,或加 `--oref <图片链接>`)出同一台机器人的正面和侧面各一张,Tripo 多视图建模会更准。
```
the same broken survey robot sitting against a wall, straight side view, entire robot in frame, plain light grey background, soft even studio lighting, product render --ar 1:1 --v 7 --style raw
```

## B 组:氛围图(定方向,16:9)
**B1 现在的街**
```
rainy night in an old Chinese residential alley awaiting demolition, empty and silent, wet asphalt reflecting a few dying neon signs, a red demolition character painted in a circle on a rolled steel shutter, tangled overhead cables, air conditioners and balconies on old tiled walls, one sodium street lamp, dark but readable, cinematic 35mm film still, melancholic --ar 16:9 --v 7
```

**B2 等待的机器人**
```
a broken survey robot sitting against a rolled steel shutter in the rain at night, its single mechanical eye dark, a flickering fluorescent tube on the wall above it, puddles reflecting distant neon, old Chinese street, cinematic film still, lonely --ar 16:9 --v 7
```

**B3 光束里的过去(主画面)**
```
over-the-shoulder view of a broken robot whose single eye projects a warm amber cone of light across a rainy night street; inside the cone the past returns: neon signs glowing, people with umbrellas, warm lit shop windows, a parked old sedan with headlights on; outside the cone the street is dark and abandoned; volumetric light, rain streaks, cinematic film still --ar 16:9 --v 7
```

**B4 高潮的门**
```
close-up of an old green wooden door with a faded red good-fortune paper and couplets, a pale painted wooden door frame with a child's pencil height marks and ages written beside them, a child's shadow cast on the frame by warm porch light, rain at night, tender, cinematic film still --ar 16:9 --v 7
```
