# Midjourney 提示词(第四版,长版,2026-10-17)

用途:**宣传 Tripo 模型**。A 组是给 Tripo 建模用的参考图(要干净、完整、细节清楚);B 组是氛围图(定画面方向)。
生成后把图放进 `~/Games/新游戏/assets/mj/`,文件名带上编号(如 `A1-1.png`)。我挑好后把选中的图、Tripo 参数和积分发你确认,再提交建模。

挑 A 组图的标准:整个物体都在画面里、四周留白、没有被裁切;背景是干净的浅灰单色;没有地面投影、没有强反光;结构清楚、看得出零件怎么连接。每条出 4 张,挑 1–2 张。MJ 不认中文字,提示词都用英文。

---

## A 组:建模参考图

### A1 机器人全身(坐姿,身体用这张建模;头在 Blender 里切掉,换成 A2 的高精度头)
```
A highly detailed full-body product render of a decommissioned urban survey robot, slumped and seated on the ground with its back resting against an unseen wall, both legs stretched forward with the knees slightly bent, the right arm resting heavily on its thigh, the left forearm missing entirely, frayed cables, hydraulic lines and a broken elbow joint hanging from the stump. The robot is roughly human-sized and slender, built from a dark gunmetal steel skeleton covered by chipped, off-white glazed ceramic armor panels with visible panel seams, bolts, maintenance hatches and faded stenciled numbers; rust bleeds from every seam and long rain streaks run down the plates; the chest panel is cracked open, revealing teal rubber coolant hoses, wiring looms and a small cooling fan. Its head carries a single large mechanical camera eye with a brass lens barrel and iris blades, currently dark. Worn, decades-old industrial design with believable engineering and realistic materials. Three-quarter front view from slightly above, the entire robot fully in frame with generous margin, isolated on a plain light grey seamless background, soft even studio lighting, no cast shadows, no ground plane, sharp focus, ultra detailed --ar 1:1 --v 7 --style raw --s 50 --no text, watermark, logo, cropped limbs, motion blur, busy background, dramatic lighting
```

### A2 机器人头(连机械眼,单独一件:头要能转、眼睛要发光)
```
A highly detailed close-up product render of the head of a decommissioned urban survey robot, isolated. A rounded off-white glazed ceramic helmet, chipped at the edges to reveal dark steel underneath, thin rust streaks running down from the seams, a dark smoked visor band across the face, and one protruding mechanical camera eye mounted on the right side of the face: a brass and black anodized lens barrel with knurled focus rings, eight iris aperture blades visible inside, a cracked glass front element and a tiny status LED. A small antenna stub and cable sockets at the back of the head, a short articulated neck with exposed pistons and braided cables. Believable industrial engineering, realistic worn materials, three-quarter front view, the whole head and neck fully in frame with generous margin, isolated on a plain light grey seamless background, soft even studio lighting, no cast shadows, sharp focus, ultra detailed --ar 1:1 --v 7 --style raw --s 50 --no text, watermark, logo, cropped, busy background, dramatic lighting
```

### A3 同一台机器人的正面、侧面(可选,让 Tripo 多视图更准)
把 A1 选中的图作为全向参考(拖进 MJ 的 Omni Reference,或加 `--oref <图片链接> --ow 100`),分别出正面和侧面:
```
The exact same decommissioned survey robot from the reference, same seated pose, same chipped off-white ceramic armor, same missing left forearm and open chest with teal hoses, seen from a straight side view (then a straight front view), entire robot fully in frame with generous margin, isolated on a plain light grey seamless background, soft even studio lighting, no cast shadows, product render, ultra detailed --ar 1:1 --v 7 --style raw --s 50 --no text, watermark, cropped, busy background
```

### A4 街边主角道具(可选,近景展示 Tripo 的模型质量)
自动售货机:
```
A highly detailed product render of an old outdoor drinks vending machine from a 1990s Chinese street, tall steel cabinet with peeling blue and white paint, a backlit glass front showing rows of faded soda bottles and cans with handwritten price tags, half of the slots empty, rust at the base, rain stains and torn stickers on the sides, coin slot and push buttons, three-quarter front view, entire machine in frame with margin, isolated on a plain light grey seamless background, soft even studio lighting, no cast shadows, ultra detailed --ar 1:1 --v 7 --style raw --s 50 --no text, watermark, cropped, busy background
```
面摊推车:
```
A highly detailed product render of an old Chinese street noodle stall cart, a wooden and dented aluminum pushcart with two worn wheels, a steaming pot on a gas burner, stacked bowls, chopsticks in a tin cup, plastic stools tucked underneath, a small faded cloth awning on bamboo poles, grease and wear on every surface, three-quarter front view, entire cart in frame with margin, isolated on a plain light grey seamless background, soft even studio lighting, no cast shadows, ultra detailed --ar 1:1 --v 7 --style raw --s 50 --no text, watermark, cropped, busy background
```

---

## B 组:氛围图(定方向,16:9)

### B1 现在的街
```
A cinematic film still of a rainy night in an old Chinese residential alley that is about to be demolished, completely empty and silent. Five-storey tiled walk-up buildings with rusted window cages, balconies stacked with abandoned laundry, clusters of air conditioners and drainpipes, and dense tangled overhead cables. Most shop shutters are rolled down, one has a large red demolition character painted inside a circle. Only a few broken neon signs still flicker in cyan and magenta, their light reflected in long streaks on the wet asphalt and puddles. A single sodium street lamp makes a warm pool on the road, light rain visible in its beam, faint mist in the distance. Dark but readable, rich blacks, muted colors, melancholic, shot on 35mm film, anamorphic lens, shallow depth of field --ar 16:9 --v 7 --s 250
```

### B2 等待的机器人
```
A cinematic film still of a broken survey robot sitting alone on the wet pavement against a rolled steel shutter at night, its single mechanical camera eye dark, chipped off-white ceramic armor beaded with rain, one forearm missing. A flickering cold fluorescent tube on the wall above it lights the shutter, where a red demolition character is painted in a circle beside a torn eviction notice. Puddles around the robot reflect distant cyan and magenta neon at the end of the street. Rain falling, mist, quiet and lonely mood, muted colors, shot on 35mm film, low camera angle, shallow depth of field --ar 16:9 --v 7 --s 250
```

### B3 光束里的过去(主画面)
```
A cinematic film still, over-the-shoulder view from behind the dark wet helmet of a broken robot sitting in the rain, its single eye projecting a sharp warm amber cone of light across a dark abandoned night street. Inside the cone of light the past comes back to life: neon shop signs glowing in vivid colors, warm lit shop windows with shelves of goods, people in raincoats walking with umbrellas, an old white sedan with its headlights on, steam rising from a noodle stall, red paper lanterns. Outside the cone everything stays dark, empty and decayed. Volumetric light, visible rain streaks and dust inside the beam, wet reflective ground, high contrast between the present and the memory, emotional, shot on 35mm film, anamorphic lens --ar 16:9 --v 7 --s 250
```

### B4 高潮的门
```
A cinematic film still, close-up of an old green wooden front door at night with a faded red good-fortune paper and torn couplets, set in a pale, worn, painted wooden door frame. On the frame are a child's pencil height marks, short hand-drawn lines with ages written beside them, climbing year by year and stopping at eleven. A small child's shadow falls across the frame in the warm light of a single porch bulb, but no child is there. Rain falls behind, the tiled wall is wet, the mood is tender and heartbreaking, muted colors, soft warm light against cold blue night, shot on 35mm film, shallow depth of field --ar 16:9 --v 7 --s 250
```
