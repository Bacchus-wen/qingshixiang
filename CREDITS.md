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

- 第四版修理铺的现场录音(`assets/audio/shop/`,Claude 从 Freesound 公开搜索页按 CC0 筛选、下载 HQ 预览,剪成循环/单发、单声道、响度归一):
  - AMB-Evening,City,Birds,Sparrow,Pigeon,Traffic,Wind — soundandmelodies,https://freesound.org/s/776137/ (CC0)→ dusk_loop(门外黄昏的街)
  - At dusk, busy and crowded small intersection — lastraindrop,https://freesound.org/s/757820/ (CC0)→ past_street_loop(光束里过去的街)
  - Analog CRT TV Electronic Static Noise — grcekh,https://freesound.org/s/546047/ (CC0)→ tv_static_loop
  - Light switch fluorescent flickering electric bulb — TRP,https://freesound.org/s/574100/ (CC0)→ tube_flicker
  - TV, CRT, turning on off, static, click (2012) — TRP,https://freesound.org/s/616850/ (CC0)→ tv_on
  - Writing quickly - pencil on wall — Valerie-Vivegnis,https://freesound.org/s/843923/ (CC0)→ pencil
  - bicycle-bell_19 — newagesoup,https://freesound.org/s/383631/ (CC0)→ bike_bell
  - distant backhoe pneumatic hammer — itinerantmonk108,https://freesound.org/s/705156/ (CC0)→ demolition_far
  - 另沿用上面第三版的 relay_a/relay_b(继电器声)与 dog_far_a(需署名,见下)。

## 需署名(CC BY 4.0)
- Koira haukkuu kaukana, yö — YleArkisto,https://freesound.org/s/243059/ ,CC BY 4.0(https://creativecommons.org/licenses/by/4.0/)。已剪辑、滤波 → dog_far_a / dog_far_b。

## 字体(SIL Open Font License 1.1)
- Long Cang(龙藏体)— The Long Cang Project Authors,https://github.com/googlefonts/longcang ,OFL 1.1(`tools/fonts/LongCang-OFL.txt`)。只用于离线绘制门框旁的铅笔身高刻度贴图(`tools/marks-texture.mjs` → `assets/textures/shop/marks.png`),网页不加载这个字体。

## 程序生成(本项目自制)
- 机器人、街道道具、"人曾经在这里"道具、八种人物:无界面 Blender 脚本(`tools/blender/`),由 Claude 与 Codex 编写。
- 声音:Web Audio 程序合成(Codex 编写)为主,叠加上面列出的现场录音。
- 招牌、通知、"拆"字、门框刻度:运行时 Canvas 绘制。通知文本基于 Grok 的调研(docs/research-relocation-grok.md)改写,地名虚构。

## 第四版修理铺(2026-10-18 起)
- 屋里的模型:全部由 Tripo 生成(API、CLI 与用户在 Tripo Studio 手动生成),原始网格直接上屏(分级细节见 docs/tripo-compare)。参考图由公司素材中台 gpt-image-2.5 生成(docs/gen-log.md)。
- 声音:上面列出的 CC0 录音 + Web Audio 合成(钟摆的嘀嗒、收音机里的曲子(本作原创的五声音阶小调)、电视测试音、机器人的舵机与开眼声、灯管与市电的嗡声),`src/systems/shop/sound.js`,Claude 编写。
- (第四版)顾客与孩子只以影子出现,影子由程序几何体投出,不生成人物模型;第五版已去掉这些影子和身高刻度。

## 第五版:对街照片(2026-10-19)
- 马路对面那一排店铺的"现在"和"从前"两张照片(`assets/textures/shop/street_now.ktx2`、`street_then.ktx2`)由公司素材中台生成(gpt-image-2.5-sunburst,max,3840x2160;"从前"以"现在"为参考图),画面中的店名、人物都是生成的,不对应真实的店和人。提示词与任务号见 `docs/gen-log.md`。
- 店里和门口的三维模型仍是 Tripo 生成;对街是照片,不是模型。

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
- 卷帘门贴图(红色圈'拆'、办证小广告、通知):素材中台 GPT Image 2.5 sunburst 生成,替换 cybercity 原来带西式涂鸦的版本。
