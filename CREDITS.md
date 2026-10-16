# 素材与出处

## CC0(无需署名,记录备查)
- Poly Haven 贴图:asphalt_02、concrete_wall_001、concrete_slab_wall_02、corrugated_iron、green_metal_rust、brick_4(https://polyhaven.com,CC0)。albedo 已转为灰度。
- 现场录音(`assets/audio/rec/`,Claude 剪成循环/单发、响度归一、部分滤波;Grok 核对许可):
  - Rain hitting an aluminium roof — florianreichelt,https://freesound.org/s/680152/ (CC0)→ rain_roof_loop
  - Rain - Highfield road with dripping — liambratchford,https://freesound.org/s/718932/ (CC0)→ rain_puddle_loop
  - Water dripping on rain gutter — majkanolan,https://freesound.org/s/384971/ (CC0)→ gutter_drip_loop
  - Back Alley in London (night:traffic) — Walter_Odington,https://freesound.org/s/26778/ (CC0)→ city_far_loop
  - Night wind in an underpass — StephanBrenn,https://freesound.org/s/656749/ (CC0)→ wind_loop
  - Whistling And Fluttering Wind Between Buildings — vazdaz,https://freesound.org/s/787541/ (CC0)→ wind_gust
  - Shortwave Radio Static - Tuning & Faint Voices — Funkelfang,https://freesound.org/s/845140/ (CC0)→ radio_loop
  - Contactor/motor overload relay noises — tt_runscript,https://freesound.org/s/807384/ (CC0)→ relay_a/b/c
  - Light Rain Distant Thunder July 5th 2016 — kvgarlic,https://commons.wikimedia.org/wiki/File:Light_Rain_Distant_Thunder_July_5th_2016.wav (CC0)→ thunder_roll

## 需署名(CC BY 4.0)
- Koira haukkuu kaukana, yö — YleArkisto,https://freesound.org/s/243059/ ,CC BY 4.0(https://creativecommons.org/licenses/by/4.0/)。已剪辑、滤波 → dog_far_a / dog_far_b。

## 程序生成(本项目自制)
- 机器人、街道道具、"人曾经在这里"道具、八种人物:无界面 Blender 脚本(`tools/blender/`),由 Claude 与 Codex 编写。
- 声音:Web Audio 程序合成(Codex 编写)为主,叠加上面列出的现场录音。
- 招牌、通知、"拆"字、门框刻度:运行时 Canvas 绘制。通知文本基于 Grok 的调研(docs/research-relocation-grok.md)改写,地名虚构。

## 改编使用(第二版,公司内部展示)
- 机器人外壳:Kestrel K-1 by thtbee_(https://github.com/thtbee/waggles),CC BY-NC 4.0。改动:按关节重新组装为坐姿、去掉左前臂、减面、换材质、装上我们自己的测绘机械眼(tools/blender/kestrel_robot.py)。

## 代码与库
- three.js r186(MIT)、GSAP(标准许可)、Vite(MIT)、Playwright(Apache-2.0,仅开发)、stats-gl(MIT,仅开发)。
- thtbee/waggles(CC BY-NC 4.0):本次楼体工作未使用其代码或素材;机器人相关记录由对应工作流补充。

## 灵感
杉本博司《海景》、塔可夫斯基《潜行者》、荣荣《废墟》、王兵《铁西区》、Todd Hido《House Hunting》。

## cybercity 楼体与店内（w19，2026-10-16）
- 来源：[xikhar/cybercity](https://github.com/xikhar/cybercity)。**无许可证，仅限公司内部展示**。本次按用户明确授权移植；不作为可公开再分发素材。
- 改编做法/代码：`src/systems/buildings/materials.js` 的 4×2 墙面图集、程序窗框、视线射线与房间盒求交/4×4 房间图集；`shops.js` 的店内背板与门洞；`props.js` 的空调风扇环形格栅。重写为本项目的 `src/systems/street/cc-materials.js`、`cc-geometry.js` 和 `props.js`，接入现有 memoryMask、湿润度与按材质合并，保持原街道布局。
- 使用贴图（上游均位于 `assets/textures/buildings/`）：
  - `atlas_albedo.png` → `assets/textures/cc/atlas_albedo.jpg`
  - `atlas_normal.png` → `assets/textures/cc/atlas_normal.jpg`（非颜色数据）
  - `interior_atlas.png` → `assets/textures/cc/interior_atlas.jpg`
  - `shutter.png` → `assets/textures/cc/shutter.jpg`
  - `shelves.png` → `assets/textures/cc/shelves.jpg`
  - `shop_ramen.png` → `assets/textures/cc/shop_ramen.jpg`（裁取 x=240、y=340、w=1160、h=650 的厨房，移除日文菜单、价格、布帘和装饰，供张记面馆等餐馆使用）
- 模型：`assets/models/buildings/ac_unit.glb` → `assets/models/cc/ac_unit.glb`；保留几何，运行时替换为风化机壳与程序风扇格栅材质。未使用其他上游 GLB。
- 贴图以 sips 转 JPEG，质量 90，最长边不超过 2048；裁图用 ffmpeg，无生成式服务。可在项目根目录运行 `sh src/systems/street/convert-cc.sh` 重建本组资产。

## 生成素材(第二版,公司工具,内部展示)
- 道具参考图:公司素材中台 vmc(Seedream 5.0)生成,assets/generated/refs/。
- 道具 3D 模型:Tripo v3.1 图生模型(带 PBR 贴图),经 tools/blender/normalize_prop.py 统一尺寸与原点、贴图缩到 1024、meshopt 压缩,assets/models/v2/。
- 地面贴图:xikhar/cybercity 的 asphalt、sidewalk_tiles、paint_wear、manhole、drain_grate、litter_atlas(无许可证,仅限公司内部展示),assets/textures/cc/ground/。
- 中式店内与房间贴图(shelves.jpg 小卖部货架、shop_ramen.jpg 面馆后厨、interior_atlas.jpg 16 间老式居民房):公司素材中台 vmc(GPT Image)生成,替换 cybercity 原来带日文的版本。
