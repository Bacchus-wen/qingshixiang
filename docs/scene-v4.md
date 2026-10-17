# 场景重新设计(第四版草案,2026-10-17)

## 为什么要重新设计
- 现在的场景是一条 84 米长的直街,两侧楼体由程序盒子拼成,几十种道具平铺。镜头远,主角小,模型经不起看,内存却很大。
- 作品的目的是**宣传 Tripo 模型**。场景应该是"主角模型的舞台":少而精、能近看、构图有层次,而不是越长越满。
- 参考作品(cybercity、灯塔对比视频里 Gemini 那一版)的共同点:**先有清楚的美术方向**,形体简单但可读,配色统一,光照讲故事;模型不一定复杂。

## 新场景:老城死胡同的尽头(约 25 米深、6 米宽)
- **地点**:一条等待拆迁的老巷最里面的一段,是死胡同。两侧是四五层的贴瓷砖老居民楼,巷口外面是远处现代城市的高楼灯光,老与新对照。
- **舞台(由近到远)**:
  1. **机器人**(Tripo 主角):坐在巷底的墙根,头顶一根快坏的冷白灯管,身后卷帘门上有红圈"拆"。
  2. **废弃的桑塔纳**(Tripo):停在巷子中段,车门半开。
  3. **面摊推车**(Tripo,记忆里才出现):冒着热气,几张塑料凳。
  4. **自动售货机**(Tripo):街上唯一还通电的东西。
  5. **绿色木门 + 浅色旧门框**(高潮):在机器人斜对面,门框上有铅笔刻度。
  6. 头顶成捆电线、空调外机、晾衣竿、几块招牌(远处,可以用简单模型)。
- **光**:现在是冷蓝青的夜,只有一盏钠灯、一根闪烁的灯管、两三块快坏的青色/品红霓虹;记忆是琥珀色光锥,光里窗户亮、招牌亮、有人撑伞走过。
- **主要机位**:①从巷口往里看(开场);②机器人近景(等待);③机器人肩后看向对面的门(主玩法);④门的特写(高潮)。
- **好处**:场景小一半以上,主角模型都在近景,贴图和几何预算可以集中给 4–5 个 Tripo 主角。

## Midjourney 场景参考图提示词
建议同一条提示词出两种风格各 4 张:**A 写实电影感**(用原提示词)和 **B 游戏概念设计**(把结尾的风格句换成括号里那句)。挑出你喜欢的方向,我再据此细化。
参数按 Midjourney 当前默认模型 V8.2 写;如果 Tripo Studio 里的 Midjourney 不认 `--v 8.2`,删掉这个参数即可。

### K1 主画面(机器人肩后,光束照出过去)
```
Key frame concept for a cinematic real-time 3D scene: a narrow dead-end alley in an old Chinese neighbourhood that is about to be demolished, at night in heavy rain. In the foreground, seen from just over its shoulder, a broken survey robot sits slumped against the end wall, chipped off-white ceramic armour beaded with rain, its single mechanical eye glowing amber and projecting a sharp cone of warm light across the alley. Inside the cone the past comes back to life: a noodle stall pushcart with rising steam and plastic stools, neon signs glowing pink and cyan, people walking with umbrellas, warm lit shop windows, an old white sedan with its headlights on. Outside the cone everything belongs to the dark abandoned present: rolled-down rusted shutters with red demolition circles, tangled overhead cables, air conditioners and laundry on tiled walk-up buildings, deep puddles reflecting the beam. At the far end of the alley the skyline of a modern city glows behind the old houses. Strong depth layering, clear readable silhouettes, cold blue-teal night palette against warm amber light with a few neon accents, volumetric rain, cinematic lighting, photoreal film still, ultra detailed --ar 16:9 --v 8.2 --s 250
```
(B 风格把 `photoreal film still, ultra detailed` 换成 `stylized realistic video game environment concept art, clean shapes, hand-painted textures, cozy melancholic mood`)

### K2 开场(从巷口往里看,现在)
```
Establishing shot for a cinematic real-time 3D scene, looking into a narrow dead-end alley of an old Chinese neighbourhood from its entrance, at night in heavy rain. Five-storey tiled walk-up buildings on both sides with rusted window cages, clusters of air conditioners, drainpipes, laundry poles and dense tangled overhead cables. An abandoned white sedan sits halfway down with one door open, an old vending machine glows faintly on the left, rolled-down shutters carry red demolition circles and torn notices. At the very end of the alley, small and alone under a single flickering cold fluorescent tube, a broken robot sits slumped against the wall. Only two or three dying neon signs still flicker in cyan and magenta, their reflections stretching across the wet ground. Cold blue-teal palette, rich blacks, mist, rain streaks, melancholic and quiet, photoreal film still, ultra detailed --ar 16:9 --v 8.2 --s 250
```

### K3 场景布局图(等距微缩模型,用来定 3D 布局)
```
Isometric 3D diorama of a small dead-end alley in an old Chinese neighbourhood at night in the rain, cut away on a square base like a miniature model. Two rows of four-storey tiled walk-up buildings with balconies, air conditioners, laundry and tangled cables; at the end wall a broken off-white robot sits under a flickering fluorescent tube beside a rolled shutter with a red demolition circle; an abandoned white sedan with one door open in the middle; an old vending machine; a green wooden front door with a pale wooden frame opposite the robot; puddles reflecting a few cyan and magenta neon signs; warm amber light from the robot's eye falling across the alley. Clear readable layout, high detail, soft miniature lighting, 3D render --ar 4:3 --v 8.2 --s 200
```

### K4 高潮的门(已在 docs/mj-prompts.md 的 B4)

## 接下来
1. 你用 K1–K3 出图;如果效果不好,我根据你找来的生图方法或别人的场景提示词再改。
2. 选定方向后:我按参考图拆出主角模型清单,为每个主角写建模参考图提示词(docs/mj-prompts.md 的 A 组格式),再走 Tripo。
3. 性能分析(cybercity 与我们实测对比)和参考帖调研正在进行,结果写进 docs/perf-analysis.md 和本文件。
