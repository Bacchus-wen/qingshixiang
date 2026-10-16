先读调研和协作相关的技能，再去 X 上把原帖、回复和同类作品的素材来源扒清楚。使用 agent-reach 的 X / GitHub 通道做只读调研。先看任务板和 Twitter 用法，再抓原帖与同类作品。原帖已读到。Doctor 没实时验证 Twitter 登录，X 搜索改用本机会话的接口，同时在已克隆的仓库里核对字体和贴图出处。链接在帖子里被截断了。接下来展开网址，并继续找 ION LANDS 和同类演示。线上地址和仓库许可已经对上。正在把按「对我们最有用」排序的调研写进 `result.md`。只读任务写不进项目目录，报告在下面。按对我们有用的程度排序。没有把文件下进项目，也没有开浏览器或 Blender。

agent-reach 的 doctor 没有实时验证 Twitter 登录，原帖和回复用的是本机会话的 X 接口，被截断的链接用 fxtwitter 展开。仓库体积来自 GitHub 文件树，线上地址只做了 HEAD。

## 怎么用

现在是银盐废街，颜色只在眼睛的光里。霓虹城只当技术样本。CC0 和 MIT 可以收（MIT 要留版权声明）。CC BY 必须署名。CC BY-NC、没有 LICENSE、作者写明不要使用、以及别人的游戏角色，都不要拷进 `assets/`。Nivalis 和 Cloudpunk 是商业游戏，没有公开素材包，不要从安装目录里抽。

## 原帖

**NEON KAIDO，Shikhar（@xikhar）**  
https://x.com/xikhar/status/2109782676085539061 （2026-10-12）

他说 Opus 5.5 能把一张参考图变成一座 3D 世界。正文没有参考图出处，也没有写模型、贴图、HDR 或字体。接着他贴了仓库：https://x.com/xikhar/status/2109804861055496393 → https://github.com/xikhar/cybercity ，并说做到一半停下，有 bug，**不是给人实际使用的**。@threejs 问了 gh-pages，写出 https://xikhar.github.io/cybercity （https://x.com/threejs/status/2109889242738676171）。今天这个地址仍是 404。回复里没有 Poly Haven、Sketchfab 或 HDR。下面的文件是核对已经克隆的 `reference/cybercity` 得来的。

GitHub 没有 LICENSE 文件。`package.json` 写着 `"license": "ISC"` 和 `"private": true`。按作者自己的话，只学不拷。

| 类型 | 数量 | 体积 |
|---|---|---|
| png | 71 | 232 MB |
| glb | 36 | 39 MB |
| jpg | 30 | 3.7 MB |
| woff2 | 6 | 0.08 MB |

没有 hdr、没有 ktx2。最大的是 `atlas_normal.png` 17.5 MB、`atlas_albedo.png` 14.4 MB、`posters.png` 10.8 MB、`interior_atlas.png` 7.6 MB、人群 `female.glb` 7.5 MB 和 `male.glb` 7.2 MB，店铺图各约 4.5–5.5 MB。36 个 glb 的生成器都是 `Khronos glTF Blender I/O v5.2.40`，网格里没有嵌贴图。

技术在本地源码里：立面一份 TSL 材质，程序窗加内部映射（`src/systems/buildings/materials.js`）；墙和地面是贴图集；人群是 VAT 加 InstancedMesh；车按类型和 LOD 实例化；环境反射是程序霓虹天烘进 PMREM，不是 HDR 文件。字体是包里的 Rajdhani woff2，帖子没写来源，副本也没有附 OFL。PNG 里没有下载站的文本块。

对我们最有用的是内部映射、墙贴图集和店铺室内图集。w19 已经在移植思路。贴图和 glb 不要进 `assets/`。

他的其他作品：

- Spiderbench 工作流：https://x.com/xikhar/status/2104717572788883829 。别人问是不是用了纽约地图，他答跑了约三天，喂了很多游戏里的和其他的城市图（https://x.com/xikhar/status/2110077754075144613）。仓库 https://github.com/xikhar/spiderbench 。许可是 Source-Available, View-Only：可本地看，不许再发布，不许放进任何产品。又是非官方蜘蛛侠粉丝作品。大约有西装法线 18 MB、`spiderman.glb` 9.9 MB、`vehicles.glb` 8.1 MB、`interiors.png` 5.6 MB。没有 Pages。不要拿。
- Walden：https://x.com/xikhar/status/2106527292633825693 说模型用 Tripo。可玩 https://xikhar.github.io/Walden/ ，仓库 https://github.com/xikhar/Walden ，无许可证。glb 约 41 MB，其中 `ruins_kit.glb` 3.3 MB，是奇幻废墟。
- 虚幻机器人：https://x.com/xikhar/status/2109084216768319499 ，Tripo 机器人，没有浏览器地址。
- 他 10 月 15 日说用 AI 图当 3D 参考。那是工具，不是素材包。

**Kestrel K-1，Bee（@thtbee_）**  
https://x.com/thtbee_/status/2110390964028330106 （2026-10-14）

演示 https://thtbee.github.io/waggles/kestrel-k1/ ，仓库 https://github.com/thtbee/waggles 。Three.js 加 Blender，约 30 小时，先做手再做成整机。回复里没有贴图站或 HDR。他自己后来说是多轮，不是一次生成（https://x.com/thtbee_/status/2110766393079804234）。

LICENSE 和 README 都是 **CC BY-NC 4.0**。要署名并链回仓库。商业使用不允许。公司项目不要收 glb。

仓库里只有这四份模型：`torso.glb` 4.05 MB、`limbs.glb` 3.19 MB、`head.glb` 2.75 MB、`shells.glb` 2.73 MB。字体是 Inter Tight 和 IBM Plex Mono。没有 HDR。

同一仓库、同一许可：

| 演示 | 地址 | 帖子 | 素材 |
|---|---|---|---|
| Bee's Waggle | https://thtbee.github.io/waggles/bees-waggle/ | https://x.com/thtbee_/status/2105320019920080921 ，提示词 https://x.com/thtbee_/status/2105366297886491134 | 一个 HTML。清漆、虹彩、实例化复眼。Google 转发过 https://x.com/Google/status/2110114445628162512 |
| STRIX HX-9 | https://thtbee.github.io/waggles/strix-hx9/ | https://x.com/thtbee_/status/2110069786415968754 | 作者说纯程序生成，工作流还没发。没有飞机 glb |
| Skyward Pagoda | https://thtbee.github.io/waggles/skyward-pagoda/ | README 有条目 | 程序体素塔，无 glb |

更早的 F1 提示词（https://x.com/thtbee_/status/2103506615987298704）要求「选一张 HDR」，没有文件名，那个演示也不在现在的四个文件夹里。

对我们有用的是壳体分件和剖面。白瓷影棚正是美术方向要避开的。

## Nivalis Nights 与 Cloudpunk

@ionlands（Marko Dieckmann）近一个月发的是发售和采访，不是素材表。

- 商店页：https://x.com/ionlands/status/2109007074797473994 → https://store.steampowered.com/app/1488490/Nivalis_Nights/
- 他说宣传镜头是片尾机位：https://x.com/ionlands/status/2109041153383240160
- 浪漫系统采访：https://x.com/ionlands/status/2108836321527554359
- 测试音频指到 Discord：https://discord.com/invite/ionlands ，没有公开文件

近一年没有看到他贴 MagicaVoxel 工程或贴图包。流程在外包作者的帖上。

vOxERLAT（@o_erlat）写明用 MagicaVoxel，只有照片，没有 .vox：

- 拆开的体素：https://x.com/o_erlat/status/2110032180286025959
- 悬浮轿车：https://x.com/o_erlat/status/2109674659931205878
- NEXGEN PLAZA：https://x.com/o_erlat/status/2108943997125144932
- 雨雾仰视：https://x.com/o_erlat/status/2108581617912676839

AbductedByPixel（@abductedbypixe1）做 NIVALIS 的城区，同样没有下载：

- 贫民区 https://x.com/abductedbypixe1/status/2107016102207242276
- OKANE 背景楼 https://x.com/abductedbypixe1/status/2110282673008542204
- 他标题里的 WindAI 楼 https://x.com/abductedbypixe1/status/2110620245799161982 （没有说明这是工具还是地名）
- 广播塔 https://x.com/abductedbypixe1/status/2107398066135519337

Cloudpunk 是同一工作室的前作。本轮没有找到他近一年解释 Cloudpunk 管线的帖。两部都是商业游戏。体素说明了城市为什么密，那些文件不是我们的素材。我们本来也不做体素楼。

## 近一年的浏览器作品

### 1. 霓虹天顶 · Bill Chan（@Billpwchan）

帖子 https://x.com/Billpwchan/status/2107461457936093325 （2026-10-06）。他补了一句：夜景看起来假，是从窗户后面真有房间开始改的（https://x.com/Billpwchan/status/2107463520388571163）。庙街在 Blender 里手工做，其余 9373 栋用语法长出来。

演示 https://zenith.billpwchan.art/ ，仓库 https://github.com/billpwchan/neon-zenith 。代码 MIT。LICENSE 写明 `public/` 里的模型、贴图、字体各自保留原许可，看 CREDITS.md。

ktx2 73 个共 96 MB，glb 16 个共 34 MB，webp 27 个共 16 MB，hdr 1.6 MB。大件是 `props.glb` 14.6 MB、`lightmap.ktx2` 12.5 MB、`district.glb` 7.7 MB、`kite.glb` 7.1 MB。`public/district/ph/` 是 Poly Haven 表面，单张法线约 2.3–5 MB。线上已核对 `https://zenith.billpwchan.art/district/props.glb`（15.3 MB）和 `https://zenith.billpwchan.art/district/ph/worn_corrugated_iron_nor.ktx2`（4.9 MB）。

CREDITS：贴图 CC0，Poly Haven 点名了 dirty concrete、dirty tiles、painted metal shutter、painted plaster wall、peeling painted wall、precast concrete wall、rectangular facade tiles、rusty metal shutter、square tiled wall、worn corrugated iron、asphalt、concrete，以及纸箱、外机、塑料筐、垃圾袋。环境光是 Shanghai Bund。ambientCG 的 Facade009 和 Facade019B 给远处办公楼。模型是 Sketchfab 的 CC BY，和街有关的是 abhayexe 的店铺包和香港楼、udayjeet 的程序香港楼、filadog 的售货机。车是粉丝模型，车名商标不跟着许可走。字体是思源黑体香港、昭源宋、Oxanium、JetBrains Mono，霓虹图集里还有霞鹜文楷、Noto Serif TC、Monoton、Neonderthaw、Tilt Neon。

three.js r186、WebGPU、TSL、固定种子、每扇窗后有房间、雨和雾、光照贴图、KTX2。

对我们最有用的是起皮墙、锈百叶、脏混凝土、波纹铁皮。优先按 CREDITS 的名字从 Poly Haven 和 ambientCG 重新下原件。CC BY 的店铺要署名。整座霓虹城的构图不要学。

### 2. Threejs-Punk · Anderson Mancini 与 Sunag

首发 https://x.com/Andersonmancini/status/2080975096848785673 （2026-07-25），技术清单在 https://x.com/Andersonmancini/status/2080978702251221346 。车玻璃雨滴：https://x.com/Andersonmancini/status/2084236083722682808 。源码：https://x.com/Andersonmancini/status/2103062637185819079 。

演示 https://threejspunk.vercel.app/ 和 https://threejspunk.com 。仓库 https://github.com/ektogamat/threejs-conference ，MIT，three.js ^0.185。

默认分支大约 17 MB：`cyberpunk_compressed.glb` 4.5 MB、`quadra.glb` 2.6 MB、`plane.glb` 2.4 MB、`white_home_studio_1k.hdr` 1.5 MB、`sunflowers_puresky_1k.hdr` 1.4 MB、三张 `wet-puddles-*` 各约 1 MB。这两个 HDR 的文件名和 Poly Haven 的 CC0 HDR 同名，README 致谢没有写 Poly Haven，这是文件名对得上，不是作者署名。

线上比 git 树多一截。下面 HEAD 为 200，但默认分支没有 `models/game/`。作者说过开车游戏的源码还没放。这些 rig 先不要入库。

| 路径 | 大小 |
|---|---|
| `/models/cyberpunk_compressed.glb` | 4.7 MB |
| `/models/quadra.glb` | 2.7 MB |
| `/models/billboards.glb` | 8 KB |
| `/hdri/sunflowers_puresky_1k.hdr` | 1.5 MB |
| `/hdri/white_home_studio_1k.hdr` | 1.5 MB |
| `/textures/wet-puddles-albedo.jpg` | 1.0 MB |
| `/textures/rainDrop.png` | 5 KB |
| `/models/game/quadra_rig.glb` | 3.0 MB |
| `/models/game/raijin_rig.glb` | 2.4 MB |
| `/models/game/katana_rig.glb` | 2.0 MB |
| `/models/game/velora_rig.glb` | 1.5 MB |
| `/models/game/tachyon_rig.glb` | 1.4 MB |
| `/models/game/tsurugi_rig.glb` | 1.4 MB |
| `/models/game/vanta_rig.glb` | 1.0 MB |
| `/models/game/chrysalis_rig.glb` | 1.0 MB |
| `/models/game/sigils.glb` | 0.3 MB |
| `/models/game/npc_car.glb` | 0.3 MB |

包里出现过的 `plaster_*.ktx2` 和 `ads.ktx2` 是 404。前缀都是 `https://threejspunk.vercel.app`。

技术在 AGENTS.md：GPU 雨读高度图，落到屋顶上；湿地不用 SSR，用半分辨率镜像，按粗糙度混；车漆雨滴来自 rocksdanister/rain。文档在 `docs/techniques/collision-rain.md`、`wet-ground.md`、`car-surface-rain.md`。

对我们最有用的是雨要知道屋顶在哪，湿地用一张便宜镜像。Quadra 这个名字靠近别人的车标，游戏 rig 不要用。

### 3. Three Fenestra · Codedgar（@codedgar_dev）

https://x.com/codedgar_dev/status/2067680201845231976 （2026-06-18）。仓库在回复 https://x.com/codedgar_dev/status/2067680413900750900 。演示 https://three-fenestra.codedgar.com/ ，仓库 https://github.com/codedgar/three-fenestra ，MIT。

例子图集大约 20 MB：`room-test.png` 2.0 MB、`shanghai_riverside_1k.hdr` 1.5 MB（文件名像 Poly Haven，节选的 README 没署名）、玻璃污渍和混凝土各几百 KB。包里有两张 4×4 起始图集。

一份材质做整面窗：内部映射、窗帘和脏玻璃的前景层、每扇窗的灯光种子、远处收成平面、一个 InstancedMesh。

对我们最有用的是这套可以合法依赖的窗户算法。房间图自己画。

### 4. RainSystemThreeJS · Chiro（@chirovisuals）

https://x.com/chirovisuals/status/2072323032392024238 （2026-07-01）。仓库 https://github.com/achrefelouafi/RainSystemThreeJS ，MIT。没有单独演示域名，README 几乎是空的。

3 个 glb 共 36 MB：`porsche_911.glb` 16.7 MB、`oldcar_1.glb` 11.8 MB、`old_rusty_car_2.glb` 7.3 MB。地面是 `Asphalt024A` 和 `Asphalt025C` 的 1K jpg，这是 ambientCG 的标准文件名，CC0，README 没署名。保时捷不是 ambientCG，MIT 盖不住。车不要收。

对我们最有用的是湿沥青和涟漪。贴图去 ambientCG 下。

### 5. BuildingGeneratorThreeJS · 同一作者

https://x.com/chirovisuals/status/2074135400138830228 （2026-07-06）。仓库 https://github.com/achrefelouafi/BuildingGeneratorThreeJS ，MIT。

`procedural_building.blend` 20.8 MB，`kit.glb` 19.7 MB，墙和地板 png 共 25 MB。原模型是 Sketchfab 上 udayjeet 的程序香港楼，API 确认 CC BY 4.0：https://sketchfab.com/3d-models/procedural-hong-kong-building-528a732e84c44fd49c4726f341014a23 。大约 190 个零件打成一个实例化套件。用要署名。

对我们有用的是套件怎么打成一个 glb。骑楼造型不是这条废街。

### 6. ProceduralBuildingsThreeJS · 同一作者

https://x.com/chirovisuals/status/2104548658171834749 （2026-09-28）。演示 https://proceduralbuildings.chirostudio.xyz/ ，仓库 https://github.com/achrefelouafi/ProceduralBuildingsThreeJS ，MIT。

巴黎、纽约、中式三栋楼按 Blender 节点图在浏览器里求值，窗后有房间和纱帘。贴图文件名是 ambientCG：`Asphalt031`、`Granite001A`、`Plaster001`、`Road012A`、`Ground054`、`Bark012` 等，jpg 约 21 MB，png 8 MB，`kit.glb` 0.5 MB。blend、hdr、exr 在 git 树里是 0 字节，像 LFS 指针，这次没有拉 LFS。

对我们有用的是窗帘和室内跟着窗洞长出来。贴图去 ambientCG 下。

### 7. 官方程序城市 · mrdoob

https://x.com/mrdoob/status/2071776392606634211 和加了店内的 https://x.com/mrdoob/status/2072702566249677125 。他自己写下载约 4 MB，M1 Air 约 40 fps，生成约 2 秒。

- https://raw.githack.com/mrdoob/three.js/1848b11ef40099912054747a74b95be7d8c45cc2/examples/webgpu_generator_city.html
- https://raw.githack.com/mrdoob/three.js/e533e1efdb86f295d76551cf0f4cc268b28f86db/examples/webgpu_generator_city.html

仓库是 three.js 对应例子，MIT。几何和贴图加载时生成，没有 glb。许可最干净。画面是阳光都市。

### 8. NEO//KYOTO · Chiro

https://x.com/chirovisuals/status/2109616909029093509 （2026-10-12）。演示 https://cybercity.chirostudio.xyz/ ，仓库 https://github.com/achrefelouafi/CyberCityThreeJS ，MIT。

运行时就是 `car.glb` 和 `kit.glb` 各 2.9 MB，外加 `cybercity.blend` 2.9 MB，以及 three.js 示例的 `Fox.glb`、`RobotExpressive.glb`。77 张 png 大多是 docs 和 video 里的截图。线上 `/assets/car.glb` 和 `/assets/kit.glb` 已确认是 glb。JS 里没有别的大贴图。

对我们有用的是区块流送，以及 Blender 滑条变成网页控制。视觉是合成波霓虹。

### 9. GrassSystemThreeJS · 同一作者

https://x.com/chirovisuals/status/2073084997863366689 。仓库 https://github.com/achrefelouafi/GrassSystemThreeJS ，MIT。保时捷和锈车又出现了，不要拿。地面是 ambientCG 的 `Ground048`、`Ground103`、`Moss002`，jpg 共 18 MB。青苔和干裂适合废墟地面。

### 10–16. 只看、不收

10. xikhar/cybercity。见上面。已经在 `reference/cybercity`。  
11. Kestrel、STRIX、蜜蜂、天空塔。CC BY-NC。  
12. Afterlight，@nickfromlater，https://x.com/nickfromlater/status/2099533252570530259 。演示 https://afterlight-cyberpunk.nickfromlater.chatgpt.site/ ，仓库 https://github.com/nickfromlater/afterlight ，无许可证。png 27 MB（混凝土、沥青、车间墙、窗户、面店），glb 7 MB。不要收。  
13. Factory Yard，@KhalidDevLog，https://x.com/KhalidDevLog/status/2107870449593909592 。仓库 https://github.com/Khalidabdi1/factory ，MIT。没有环境 glb，6 张文档截图共 2.8 MB。世界是代码长的。题材不是这条街。  
14. Spiderbench 和 Walden。见原帖一节。  
15. Lake-City，@givros，https://x.com/givros/status/2106407239716372631 。演示 https://givros.github.io/lake-city/ ，仓库 https://github.com/givros/lake-city ，无许可证。519 张 png、438 MB，多数是对比图，glb 约 4.8 MB。  
16. 孟买雨夜，@karanC_12，https://x.com/karanC_12/status/2107498269660377280 。仓库 https://github.com/karanchoudharyyt-source/mumbai-monsoon ，无许可证。一个 HTML，只有一张 0.1 MB 的 `og.jpg`。可看程序湿路，没有贴图可扒。

还没放出演示的：Alex St. Louis 说把 Epic 的 Matrix 城跑进了浏览器（https://x.com/AlexStLouis10/status/2110842418786615726），没有网址，就算有也不能扒。Gerry 的 50 km² 东京（https://x.com/Gerry/status/2110060942390153255）正文里没有演示或仓库。

## 建议收什么

从原站下，不要从别人的构建里抠：

1. Poly Haven CC0：Neon Zenith 点名的 peeling painted wall、dirty concrete、rusty metal shutter、painted plaster、worn corrugated iron、precast concrete。环境要 HDR 的话用他写的 Shanghai Bund。
2. ambientCG CC0：Asphalt024A、Asphalt025C、Ground048、Ground103、Moss002、Plaster001、Road012A。文件名就是出处。
3. MIT 代码当库：`three-fenestra` 的窗，Threejs-Punk 的雨高度图和湿地，mrdoob 的程序店内。
4. CC BY 才考虑 udayjeet 的程序香港楼，必须署名，优先级低。

不要进 `assets/` 的：cybercity 全套、Spiderbench、Walden、waggles 全部、Afterlight、Lake-City、Nivalis / Cloudpunk 的任何抽出文件、Threejs-Punk 的 `models/game/*`。网上还有 `olekariamunyororo-crypto/threejs-punk-adam`，简介写着加了 Adam Smasher，那是别人的游戏角色，不要看。