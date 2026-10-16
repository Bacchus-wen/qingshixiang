# cybercity 拆解:为什么它"满",我们"灰"(Claude,2026-10-17)

只读分析。参考 = `reference/cybercity/src`(下称"参"),我们 = `src`(下称"我")。两边都是 three 0.186.1。
AGENTS.md:参考代码不复制,只学思路和数值;借用贴图要记 CREDITS.md。现在态依旧"暗、零星",下面多数手段主要让**记忆锥里**变满。

## 诊断(三个数字)
1. 雾把路面泡灰:我 `atmo/index.js:32` 用 `exponentialHeightFogFactor(0.006, 8)`,公式是 1-exp(-(0.006·(8-y)·viewZ)²),
   路面 y=0 时 10m 处 21%、20m 处 60%、30m 处 87% 是雾色;参用自写雾,30m 约 4%,100m 约 20%。
2. 光太少:参约 190 盏真点光源在池里轮转(外加店铺、路灯、桥、车灯);我全场 3 盏街灯级光源,约 80 块招牌一盏也没有。
3. 倒影只有一半:我 SSR 门控两次(refl²)+ maxDistance 60 + maxLuminance 默认 10;同一招牌倒影强度约为参的 50%,亮处还被削顶,也没有竖向拖影。

按"对我们画面的提升 / 工作量"排序如下。

## 1. 空气:近处清、远处带色光雾;去掉灯下体积盒;散射交给后期
**参**
- `atmosphere/atmo.js:23-29`:fogDensity 0.0022、fogFalloff 0.028/m、**fogStart 14m**(相机前 14m 完全无雾)、hazeDensity 0.0002、fogMax 0.985、groundGlow 0.18。
- `atmo.js:87-110` 自写 `scene.fogNode`:高度积分 × 距离;雾色不是常量,而是 `hazeColor(视线方向)`(`atmo.js:42-59`,与天空共用一个函数,
  按方位叠三道光污染带:品红 exp(-7h)、橙 exp(-13h)、蓝 exp(-5h));近地 ×(1+0.18·exp(-y/35));再乘漂移噪声斑块 P.xz·0.0035(0.55–1.45)。
- 天空 `atmo.js:64-84`:256² 多通道噪声纹理(`noiseTex.js`)做低云底,p = dir.xz/(h+0.07)·0.22 + 风偏移,云密处更亮 mix(0.35,1.5,dens)。
- 体积光几乎没用:`lightShaft.js` 只暴露 API,无系统调用。"空气感"来自 `engine/PostFX.js:133-136` 深度加权散射:
  `gaussianBlur(lit, σ=2, 6, 1/4 分辨率)`,混合量 (1-exp(-0.006·d))·0.16,再整体加 blurred·0.03。

**我**
- `atmo/index.js:27-32` 指数高度雾(见诊断 1),颜色常量 (0.030,0.036,0.052)。雾最浓处正是路面和墙脚,也就是倒影和溢光所在的位置。
- `atmo/index.js:92-99` 每盏路灯一个 12×8.5×12m 的加法 `VolumeNodeMaterial` 盒(密度 0.03),就是 `docs/snap-v2-street-now.png` 街心那块灰白板。
- `atmo/index.js:35-40` 天空只有两色渐变,没有云。

**移植**(`systems/atmo/index.js` + `engine/PostFX.js`,Claude,约 0.5 天)
- a. 自写 fogNode(思路同参):fogStart 8m、密度 0.004、高度衰减 0.05/m(我们楼高 7–19m)、haze 0.0003、上限 0.9。
  估算 30m 约 9%、街尽头 80m 约 28%。雾色 = hazeColor(dir):冷底 (0.035,0.042,0.06);−Z 远城方向低空一道钠黄光污染带 exp(-12h)·(0.06,0.035,0.018);一道弱冷蓝;groundGlow 0.15。闪电仍加在雾色上。
- b. `scene.backgroundNode` 用同一个 hazeColor 再加低云底。远处楼的剪影这样会溶进光里,而不是泡在灰里。
- c. 删掉两盏路灯的体积盒;如要保留,尺寸收到 4×7×4、密度 0.006,只包住灯锥。眼睛光束的体积保留(故事核心)。
- d. `PostFX.js:110` traa 之前插入深度散射(数值同参)。
- 验收:`street-eye`、`street-low` 两张图,20m 处路面不再是雾色;用 `?novol` 对比。

## 2. 每个发光体都真照亮东西:Forward+ 簇光照 + 光源池
**参**
- `engine/Engine.js:28` `renderer.lighting = new ClusteredLighting()`。它只聚类**不投影的 PointLight**(`ClusteredLightsNode.js:219`),聚光灯和带阴影的灯照常走原路径。
- `signage/lights.js:24-80` LightPool:190 盏真 PointLight 常驻(low 档 96,`signage/index.js:33`),候选上百个。
  每 20 帧按 importance·intensity·(在镜头前方 ? 1 : 0.35)/(1+0.004d²) 排序(`lights.js:60`),>170m 的不要(`:57`)。
  分不到的灯 intensity=0 并移到 y=-2000,**不切 visible**(`:71`)。`flickerJS` 与着色器里的闪烁同步(`:12-22`)。
- 每块招牌一盏:竖招 (霓虹 9 / 灯箱 7)·√(深×高),距离 min(20, 9+1.3H),位置在招牌外 0.2m、0.35H 高(`signs.js:109-112`);
  平招 (5.5/4.5)·√(W·H),距离 min(20, 8+W),离墙 1.0+0.15H(`signs.js:143-147`);屋顶大字 14·√(W·H),距离 20m(`signs.js:211`)。
- 店铺开口一盏:6(便利店/柏青哥 9),距离 9m,门楣下 0.35m、外 0.6m(`buildings/shops.js:81-83`);11m 内去重(`buildings/index.js:112-126`)。
  路灯 55,距离 22m(`signage/street.js:59-60`);大广告牌 160,距离 24m(`billboards.js:177`)。

**我**
- 只有 lamp SpotLight 650/26m(`street/details.js:255`)、far 450(`:268`)、售货机 PointLight 14/9m(`:245`)、hemi、moon、眼睛。
- `neon/materials.js:35-46` 用加法圆片假装地面溢光,墙面完全不受招牌照亮;`rain/neon.js:4-6` 只取最近 8 块招牌给雨滴染色,半径 6m。

**移植**(engine 部分 Claude,候选部分 Codex,约 1–1.5 天)
- a. `Engine.js:30` `renderer.init()` 之后:`backend==='webgpu' && quality!=='low'` 时设 `renderer.lighting = new ClusteredLighting(256, 32, 24, 64)`。WebGL2 和 low 档不开,池子缩到 6 盏。
- b. 新文件 `src/engine/LightPool.js`:init 时一次建好 N 盏(high 48,low 6)PointLight,decay 2,castShadow false。
  之后只改 intensity/position/color/distance(踩坑记录:切 visible 会让全部材质重编译)。对外接口 `ctx.api.lights.add({pos,color,intensity,distance,importance,seed,alive})`。
- c. 与参的关键差别:灯也服从"现在暗、记忆亮"。每帧对全部候选算 power = alive·mains·flickerAt(seed,t) + `memoryMaskCPU(pos, ctx.memory)`(`materials/memory.js:45`)。
  每 10 帧按 importance·intensity·max(power,0.02)/(1+0.004d²) 排序,>60m 不要(街长 84m);intensity = 基值·power。
  眼睛扫过时,锥里的招牌和店会一起把墙、地、雨照成彩色;锥外照旧暗。
- d. 候选来源:`neon/layout.js` 里 `planSigns` 的每块招牌,数值先照参的公式,再按截图调;`street/cc-geometry.js:63` `addShopInteriors` 每间店开口一盏暖光 (1,0.7,0.42),6/9m,11m 内去重。现有两盏路灯不进池。
- e. 有了真光后,`neon/materials.js:35-46` 的地面圆片关掉或降到 0.3 倍,避免叠两次。
- 验收:`memory-street`、`memory-down` 里墙面有彩色照度渐变;`street-eye` 现在态不变亮(只多 4–8 盏残存灯);`?gputime` 增量 <2ms。

## 3. 湿路倒影:SSR 只门控一次 + 竖向拖影
**参**
- `PostFX.js:80-101`:reflectivity = max(金属项, gloss·0.92)·mix(0.3,1,朝上度),gloss = 1-smoothstep(0.04,0.55,rough),直接作为 metalnessNode,`reflectNonMetals:true`;roughnessNode = rough·0.6(更锐)。
  参数:resolutionScale 0.5、quality 0.5、**maxDistance 140**、thickness 0.12、**maxLuminance 40**、screenEdgeFade 0.12、blurQuality 2。
- 竖向拖影 `PostFX.js:106-124`:朝上的像素沿屏幕 Y 方向做 7 对高斯抽样,步长 mix(0.0016,0.0085, smoothstep(0.02,0.45,rough))·朝上度 + 0.0004,加逐像素时间抖动(交给 TRAA 抹平)。参里"霓虹在湿地上拉成长竖条"就是它。

**我**(`PostFX.js:93-104`)
- refl 当 metalness 传入,SSR 内部已经乘过一次(`SSRNode.js:931`),合成时 `:104` 又乘一次,实际是 refl²。湿路粗糙度约 0.19 时 refl≈0.70,平方后只剩 0.49。
- maxDistance 60:衰减是 (1-离地高度/60)²,离地 10m 的招牌只剩 0.69(参是 0.86);maxLuminance 没设,默认 10(`SSRNode.js:216`),亮霓虹的倒影被削顶;roughnessNode 用全粗糙度,倒影偏糊。

**移植**(`PostFX.js`,Claude,2–3 小时)
- a. 合成改为 `lit = color + streak·ssrIntensity`,去掉第二次 ·refl;refl 换成参的 gloss 曲线,保留我们 mr.b 的朝上门控(0.3–1)。
- b. maxDistance 100、maxLuminance 40、roughnessNode = mr.g·0.6、screenEdgeFade 0.12。
- c. 加竖向拖影 Fn(7 对抽样)。踩坑记录说 SSR 不严格按 metalness 限范围,所以拖影后仍乘一次 mr.b,只乘这一层。
- d. Grok 上轮说"猫脚下的水坑像镜子":拖影加第 6 条的粗糙度碎裂,正好把镜面打碎。
- 验收:`street-low`、`memory-down`;用 `?pfx=ssronly` 确认倒影是竖条而不是圆斑。

## 4. 色调:保色 AgX、分离色调、霓虹白芯
**参**
- `PostFX.js:172-180`:exposure 0.82(在 AgX 里乘);hueKeep 0.45,即 tm = mix(AgX(c), c/max(c)·AgX(max(c)).g, 0.45)。纯 AgX 会把饱和霓虹过早漂成白,混入按最大通道映射的保色版本后,只有最热的芯变白。
- `PostFX.js:183-205` 显示空间调色:S 曲线 contrast 0.42;暗部 +(-0.012,0.012,0.022)·(1-lum)³;高光 ×(1.03,0.97,1.01)(lum 0.35–0.9);saturation 1.12;lift (0.0015,0.0025,0.006);暗角 0.42;颗粒 0.028,中间调加权。
- bloom 0.32 / 半径 0.7 / 阈值 1.0,smoothWidth 0.6(`:143-144`);横向变形光斑 0.06(只取 bloom >0.25 的部分,21 次抽样,步长 0.0075,偏蓝 (0.55,0.65,1),`:149-160`);边缘色散 0.00045。
- 灯管 `signage/materials.js:60-64`:管色·edge + 白芯 (1,0.95,0.92)·core·0.55 + 管色·core·0.6,core = smoothstep(0.62,0.95,mask);霓虹强度 5–8(`signs.js:87`),灯箱 1.6–2.4,LED 字 4–6。

**我**
- `PostFX.js:29-35,124-140`:exposure 1.15、标准 AgX(`renderOutput(..., AgXToneMapping)`)、saturation 1.0、contrast 0.38,没有分离色调。
- `neon/materials.js:27` tubeThen = tint·tube·3.6;`neon/atlas.js:21,31` 的灯管遮罩是硬线条,没有横截面渐变,做不出白芯。

**移植**(`PostFX.js` 2 小时,Claude;`neon/atlas.js` + `materials.js` 2 小时,Codex)
- a. `PostFX.js:124-125`:先算 `agxToneMapping(hdr, exposure)`,与保色版本按 hueKeep 0.45 混合,再 `renderOutput(..., NoToneMapping, SRGBColorSpace)`。
- b. grade 加分离色调:暗部冷,与美术方向"暗部极轻微偏冷"一致;高光暖改成 (1.02,0.99,0.96) 配琥珀。saturation 1.1(现在态材质本来无彩色,这主要放大记忆);颗粒改中间调加权。
  曝光等 1、2 做完再调,预计 0.9–1.0。
- c. bloom 半径 0.7、smoothWidth 0.6;加横向变形光斑,强度从 0.04 起;我们的琥珀 halation 保留。
- d. atlas.js 灯管通道改三层描边(线宽 ×1.0 不透明度 0.35、×0.6 不透明度 0.7、×0.3 不透明度 1.0),让遮罩值代表离管中心的距离;materials.js:27 加白芯,记忆态管强度 3.6 → 5–6。

## 5. 环境光:彩色"城市"PMREM,低强度
**参** `atmosphere/environment.js:17-96`,`index.js:9-12,30`:离线搭一个小场景烘成 PMREM。
- 内容:穹顶 = hazeColor×1.3(`:21-25`);湿暗地面(`:28-32`);46 栋暗剪影,半径 55–75m(`:43-52`);260 块彩色霓虹板,半径 30–52m,8 色,亮度 ×3.5(`:58-70`);
  40 条暖窗带 (0.5,0.32,0.18)(`:72-81`);头顶 4 条冷白灯带 (1.2,1.1,1.3)(`:83-90`,给车顶和湿地一道冷高光);`fromScene(env, 0.03, 0.1, 200)`。
- environmentIntensity 只有 0.3,hemi 0.12(0x4a5a9a / 0x1a1020)。粗糙面几乎不被环境抬灰,光滑湿面却能映出零碎彩点。

**我** `street/index.js:187-195`:背景 (0.02,0.026,0.05) + 一圈 (0.16,0.10,0.12) 灰紫色带 + 顶球,强度 0.9(`:223` 随 mains 在 0.27–0.9 间变);`details.js:278` hemi 0.26;`street/index.js:197` 月光 0.32。
一张近似均匀的灰紫环境以 0.9 强度包住所有面,这是第二个"灰"的来源:每面墙被同样抬亮,没有明暗。

**移植**(新建 `src/systems/atmo/environment.js`,`street/index.js:184-195` 改为调用它,Claude,2–3 小时)
- a. 同样思路搭环境场景,配色守美术方向:穹顶用第 1 条的 hazeColor;约 120 块小发光板,70% 冷白或钠黄窗光(低饱和),30% 褪色霓虹色(饱和度减半);2 条冷白灯带对着路面;外圈一圈暗剪影。
- b. environmentIntensity 0.3–0.35(`:223` 的 mains 联动保留);hemi 降到 0.1;月光 0.2。
- c. 现在态"看得清"改靠第 1 条的远处光雾和第 2 条的残存灯,不再靠全局抬灰。

## 6. 地面:粗糙度碎裂、积水更像镜面、路沿流水
**参** `ground/roadMaterial.js` + `materials/wet.js`
- 微粗糙度碎裂:rough ×mix(0.75,1.25, fbm(P·1.9))(`roadMaterial.js:258-259`),注释原意是"让倒影闪烁、拉丝,而不是一整块镜子"。
- 半干区:wetness ×(1 - smoothstep(0.35,0.7, fbm(P·0.06))·0.3)(`:262`)。
- 积水水位:车辙 +0.11、路沿 +0.26、裂缝也抬高,路拱中线降低(`:242-246`);积水内粗糙度 0.012、反照率 ×0.5、法线拉平(`wet.js:88-91`)。
- 路沿 0.34m 混凝土排水槽,加沿流向滚动的涟漪(`:180-191`、`:247-253`);轮迹和油渍(`:68-75`,油渍粗糙度 0.35)。

**我** `materials/ground.js:106` 粗糙度 mix(0.6,0.45,h),几乎均匀;`materials/wet.js:56` 积水粗糙度 0.03;`wet.js:18-22` 积水只看一层噪声;没有路沿流水。

**移植**(`materials/ground.js` + `wet.js`,Codex,2–3 小时)
- `groundRoad` 加微粗糙度碎裂和半干区;积水水位加"离路沿距离"项(`LANE.halfRoad` 处 +0.25)和路拱减项。
- `wet.js` 积水粗糙度 0.03 → 0.015;路沿加 0.3m 宽的流水带(`rippleNormal` 加沿 z 的滚动偏移)。
- `ground.test.mjs` 补新阈值的断言。

## 7. 招牌竖向分层 + 店面灯带(记忆态的"满")
**参** `signage/populate.js`
- 密度:avenue 1 / alley 0.9 / cross 0.7(`:19`)。门头概率 85%·密度+10%(`:33`);竖招数 round(w/6.5·密度·0.7–1.4)(`:47`);
  主街上 >20m 的楼有 45% 挂一块 8–15m 高的多层竖招(`:51-56`);16% 做成杂居楼楼层牌,4–12 格(`:62-63`)。
- **关键**:从第 3 层到顶层下一层,每层以 0.32·密度的概率再挂一块,种类有霓虹字 2.5–7m、图标、方灯箱、屏幕、上层小竖招(每栋最多 2 块)(`:73-86`)。
  招牌因此在 3m 到 20m 以上的所有高度叠起来,"层层叠叠"就是这么来的。屋顶大字概率 0.18·密度+0.04(`:99-101`)。
- 结构件:竖招每侧有框条、上下支臂、斜撑,45% 带 LED 边条(强度 2.5–4.5)(`signs.js:73-107`);店面门楣下每 1.4–2.2m 一个筒灯,emissive 1.6(`shops.js:75`);店内墙自发光 0.2–0.8(`shops.js:144`)。

**我** `neon/layout.js:44-68`:每栋固定一块竖招 + 门头 + 小灯箱 + 2/3 概率挂牌 + 1/8 概率屋顶字,高度全在 3.35–4.65m 一带(竖招最高到约 11m);
楼高 7–19m(`street/index.js:96`),上层立面没有招牌。

**移植**(`neon/layout.js` + `atlas.js` + `street/cc-geometry.js`,Codex,约 1 天)
- a. `planSigns` 加 `upper` 类:每层 fl(y = 3.2+fl·3.1+1.55)以 0.3 概率挂横霓虹字、小方灯箱或小竖招(每栋最多 2 块竖的),用 `random01` 种子;≥15m 的楼 40% 加一块 6–9m 高的多层竖招。
  全部只在记忆里亮(alive=0),坏管比例照旧 30%。
- b. 竖招加 LED 边条(40%)和支臂;店面开口上方加筒灯条(emissive 1.6 × memoryMask)。这些全部进第 2 条的光源池作候选。
- c. 招牌总数从约 80 增到约 140,先看 `atlasSize`,atlas 大概要扩一档。
- 注意:现在态仍只亮 8 块(`layout.js:73-78` 的 alive 逻辑不动),不违反"不要满屏霓虹"。

## 8. 雨和水汽被光源池照亮(前向散射)
**参**
- `weather/lights.js:6-55`:每 2 秒扫一遍场景里的点光源和聚光灯,按 intensity·range/(d²+25) 取最近 24 盏写进 uniformArray。
- `weather/common.js:37-58`:每滴雨在 compute 里累加这 24 盏灯,衰减 win²/(d²+0.35),Henyey-Greenstein 前向散射 g=0.75(雨,`rain.js:56`)/ 0.55(蒸汽,`steam.js:71`),iso 0.18;
  `softClamp` 防止灯旁一团白(`common.js:21`)。
- 蒸汽从井盖、通风口、面馆排气冒出(`steam.js`),同样被这些灯照亮。

**我** `rain/neon.js:4-6`:最近 8 块招牌,只按 6m 内的距离平滑衰减给颜色,不看灯的真实强度,也没有背光增强;`rain/index.js:106-113` 两盏路灯另算。

**移植**(`rain/neon.js`,Codex,0.5 天,依赖第 2 条)
- `syncNeon` 改为从 `ctx.api.lights` 取当前已分配的前 16 盏(位置、颜色×实际 intensity、distance)。
- `neonLight` 改成 HG 相位(g 0.7)+ 窗函数衰减 + softClamp;路灯也走同一入口,删掉 `spot()` 特例。
- 可选:面馆门口和井盖加 2–3 团蒸汽(软粒子,复用 atmo 的噪声纹理),只在记忆里浓。

## 顺序与验收
- 顺序:1 → 3 → 4 → 5(一天内做完,全是后期和 atmo,立刻去灰),然后 2 → 8(光源池),最后 6 → 7。
- 每一步跑 `tools/shot.mjs` 的 `street-eye`、`street-low`、`memory-street`、`memory-down` 四张,和 `reference/x-cyber.mp4` 第 8、24、40 秒的画面并排看。
- 每一步用 `?gputime` 记 GPU 毫秒到 `docs/PERF.md`。

## 不搬
现在态的满街霓虹、全息大广告、HUD 和小地图(美术方向禁止);参考代码不复制,只用思路和数值。
