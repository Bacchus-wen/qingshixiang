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

## 代码与库
- three.js r186(MIT)、GSAP(标准许可)、Vite(MIT)、Playwright(Apache-2.0,仅开发)、stats-gl(MIT,仅开发)。
- 参考但未复制:xikhar/cybercity(无许可证,只学思路);thtbee/waggles(CC BY-NC 4.0,只学思路,未改编其素材)。

## 灵感
杉本博司《海景》、塔可夫斯基《潜行者》、荣荣《废墟》、王兵《铁西区》、Todd Hido《House Hunting》。
