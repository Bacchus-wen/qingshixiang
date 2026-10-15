这是只读调研。我先读项目说明和检索技能，再按类核实仓库、许可证和 three.js / WebGPU 的适配情况。使用 agent-reach 的网页搜索和 GitHub 只读查询。先看本机已有的 three r186 示例和工具清单，避免把已经在用的东西再推荐一遍。# 氛围工具调研（2026-10-16）

渲染大头已经在 three.js 0.186.1 里，清单见 `docs/tech-inventory.md`，示例在 `~/Tools/refs/three-r186-examples/`。体积雾、体积光、高度雾、Godrays、GPU 雨、SSR、SSGI、GTAO、VXGI、光照探针、SkyMesh、WebGPU 高斯泼溅、TSL 光线步进都有。下面是还缺的，以及不该再装的。

## 1. 渲染与着色

直接用现成节点。体积用 `VolumeNodeMaterial` 加 `Raymarching`，参考 `webgpu_volume_lighting_traa`、`webgpu_fog_height`。雨用 `webgpu_compute_particles_rain` 加 `SoftParticles`。湿地面用 SSR + GTAO。个位数光源用烘焙光照贴图，记忆段灯多时再开 `VXGINode`。天空用 `SkyMesh`。泼溅用 `objects/GaussianSplat`（WebGPU，SPZ / PLY / KSPLAT）。

**@takram/three-atmosphere**，[仓库](https://github.com/takram-design-engineering/three-geospatial)，MIT，2026-05-27 仍有提交。Bruneton 加 Hillaire 的大气散射，地平线会和雾连成一片。`npm install @takram/three-atmosphere`，要 three ≥ 0.182。风险：WebGPU 入口作者标为进行中，还是着色器块，不是 TSL；一条街用高度雾更合适。

**Spark**，[sparkjs.dev](https://sparkjs.dev/docs/overview/)，[仓库](https://github.com/sparkjsdev/spark)，MIT，2026-10-15 仍更新，要 three r180+。多个 splat 正确遮挡、有 LOD。风险：它走 WebGL2，不进 WebGPURenderer 的深度；一条街的 splat 容易超过首屏 15MB。只在 WebGL2 回退且内置泼溅不可用时再考虑。

**不要装** [pmndrs/postprocessing](https://github.com/pmndrs/postprocessing)（Zlib，2026-10 仍更新）和 [realism-effects](https://github.com/0beqz/realism-effects)（MIT，2024-02 后停更）。二者都是 WebGL 后处理，跟 WebGPURenderer 不共用深度。[lygia](https://github.com/patriciogonzalezvivo/lygia) 是 Prosperity Public License 3.0，非商用才免费。SDF 用已有的 `tsl/utils/Raymarching`，自己写盒子和圆柱。

以后若要「记忆像照片」：用 Blender 多视角渲染，再交给 [Brush](https://github.com/ArthurBrussee/brush)（Apache-2.0，2026-10 仍更新）训练，用 [spz](https://github.com/nianticlabs/spz)（MIT）压缩。这是第二阶段，先别装。

## 2. 程序化内容

几何节点已在 Blender 5.2 里，不用新装。破立面、垂线、碎屑用节点，脚本可重复。

烘焙沿用现有 Blender：

`/Applications/Blender.app/Contents/MacOS/Blender -b -E CYCLES -P tools/blender/bake.py`

Cycles 烤 AO，以及 Diffuse 的直接光加间接光，写到第二套 UV。Mac 用 Metal，失败会掉到 CPU。光照贴图必须是线性，不能当 sRGB。

**Material Maker**，[仓库](https://github.com/RodZill4/material-maker)，MIT，1.7（2026-07），代码 2026-10-15 仍更新。做脱落、油膜、湿沥青，避免贴图重复。`gh release download 1.7 --repo RodZill4/material-maker --pattern '*.dmg' --dir "$HOME/Tools"`。风险：导出的是 PNG，还要走已有的 toktx。

**BagaPie**，[扩展页](https://extensions.blender.org/add-ons/bagapie/)，GPL-3.0-or-later。散落藤蔓、碎石、电缆。在 Blender 的 Get Extensions 里搜名字安装。风险：付费资源包不要下；5.2 比说明里的 5.0 新，先试一次。

## 3. CC0 与免费素材

**Poly Haven**，[许可](https://polyhaven.com/license) CC0，API 无密钥：[api.polyhaven.com](https://api.polyhaven.com/assets?t=hdris)。夜景 HDRI 和废墟模型。已由 `cc0-fetch` 下载。

**ambientCG**，[许可](https://docs.ambientcg.com/license/) CC0，当前 API 是 [v3](https://docs.ambientcg.com/api/v3/)。湿混凝土、沥青、锈。`cc0-fetch` 仍在打已停更的 v2，应改到 v3。风险：站点由一个人维护，批量下载要有间隔。

**Kenney**，例如 [City Kit Roads](https://kenney.nl/assets/city-kit-roads)，该包页面写明 CC0。没有 API。只做白模，低模游戏风不能当最终废墟。

**Quaternius**，[QAL v1.0](https://quaternius.com/license.html)（2026-08-28）。可以用在作品里，不能再把模型打包分发。已不是 CC0。没有 API。风格偏卡通，最终画面不用。

**Openverse**，`https://api.openverse.org/v1/images/?q=asphalt&license=cc0`，无需密钥。风险：每条都要看 `license` 字段，搜索词和结果经常不符。

**Freesound**，[API 文档](https://freesound.org/docs/api/)。到 [申请页](https://freesound.org/apiv2/apply) 拿 token，过滤 `license:"Creative Commons 0"`。风险：原文件要 OAuth2，token 只能下预览；也和项目「不用音频文件」冲突，只适合当参考。

OpenAIR 的证书已过期，打不开。[EchoThief](https://www.echothief.com/downloads/) 只有版权声明，没有 CC0，不用。

## 4. 压缩

[gltf-transform](https://github.com/donmccurdy/glTF-Transform) 4.5 和 toktx 已在 `~/Tools`。meshopt 来自 [meshoptimizer](https://github.com/zeux/meshoptimizer)（MIT）。KTX2 / Basis 来自 [KTX-Software](https://github.com/KhronosGroup/KTX-Software) 和 [basis_universal](https://github.com/BinomialLLC/basis_universal)，都是 Apache-2.0。

颜色和自发光用 ETC1S（sRGB）。法线、粗糙、金属、AO 用 UASTC（线性）。HDRI 保持 hdr 或 exr。湿地面最多 2K，其余 1K。风险：ETC1S 压法线会把积水压成塑料。

## 5. 声音

**Tone.js**，[仓库](https://github.com/Tonejs/Tone.js)，MIT，2026-10-12 仍更新。`npm install tone`。噪声、滤波、`Reverb.generate()` 自己造混响，`PannerNode` 做远近。雨、滴水、伺服、收音机杂音都够，不必下音频文件。

要音频线程里的更细 DSP，再用 **Elementary**，[仓库](https://github.com/elemaudio/elementary)，MIT，2026-01 有提交。`npm install @elemaudio/core @elemaudio/web-renderer`。风险：维护比 Tone 慢，和 Tone 二选一。

**Omnitone**，[仓库](https://github.com/GoogleChrome/omnitone)，Apache-2.0，2026-10 仍更新。只在要 Ambisonics 声场时用。程序声源用不上。

## 6. AI 验收

**WebGPU Inspector**，[仓库](https://github.com/brendan-duncan/webgpu_inspector)，MIT。抓一帧、看每个 pass、读 GPU 时间。`git clone --depth 1 https://github.com/brendan-duncan/webgpu_inspector "$HOME/Tools/src/webgpu_inspector"`，再在 Chrome 里加载未打包扩展。风险：不要打进正式包；Worker 里注入会失败。

**stats-gl**，[仓库](https://github.com/RenaudRohlinger/stats-gl)，MIT，支持 `WebGPURenderer`。`npm install stats-gl`。Playwright 读页面上的帧时间。Safari 要打开 Timer Queries。

**Chrome DevTools MCP**，[仓库](https://github.com/ChromeDevTools/chrome-devtools-mcp)，Apache-2.0，2026-10-15。`npx -y chrome-devtools-mcp@latest`。能看控制台、网络和加载。风险：性能摘要是网页指标，不是着色器耗时，要和 stats-gl 一起看。

[Spector.js](https://github.com/BabylonJS/Spector.js)（MIT，仍在更新）自述是 WebGL 调试，抓不到 WebGPU 帧。

本机已有、不用装：`threejs-game-director`、`threejs-debug-profiler`、`threejs-visual-validation`、`threejs-qa-release`、`threejs-bloom`、`develop-web-game`。Playwright 已在项目里。

## 7. 近两年氛围做得对的作品

1. [IVRESS](https://brand.ivress.co.jp)（Utsubo，2026）：几乎不给光，像短片，WebGPURenderer 加 TSL，两条后端同一套着色。
2. [Above the Grassland](https://above-the-grassland.pages.dev)（Ameen Abdullah，2026）：天气预设和声音决定节奏。
3. [依云 200 年](https://celebrating200.evian.com)（Ethan Chiu，2026）：雨先落到山上再往下流，全场共用一张风场。
4. [Threejs-Punk](https://www.threejspunk.com/)（Anderson Mancini，2026）：俯视深度让雨撞上屋顶。霓虹都市的样子不要学。
5. [Utsubo](https://www.utsubo.com)（2025）：同一套 WebGPU 管线能当正式站点，声音算进体验。
6. [I'll Call You Later](https://film.jashtechno.com)（2026）：一条夜街、几分钟、一个事件。里面的付费实时语音不要学。

## 立刻做的前 10 项

1. `npm install tone`：荒凉主要靠声音。
2. `npm install stats-gl`：验收能读到 GPU 时间。
3. 把 WebGPU Inspector 克隆到 `~/Tools/src`：这是能看 WebGPU 帧的工具。
4. `npx -y chrome-devtools-mcp@latest`：给 AI 看控制台和加载。
5. Material Maker 1.7 的 dmg 放到 `~/Tools`：程序脏迹。
6. 在 Blender 5.2 里安装 BagaPie，先试散落。
7. 打开已有的高度雾、体积光、Godrays、SSR、GTAO，不要另装后处理库。
8. 用已有 Blender 烘焙 AO 和光照贴图。
9. 用已有 `cc0-fetch` 下 Poly Haven 夜景 HDRI 和 ambientCG 湿地面，并把脚本改到 API v3。
10. 用已有 gltf-transform 和 toktx：颜色 ETC1S，法线与 ORM 用 UASTC。

Spark、postprocessing、realism-effects、lygia、Quaternius、EchoThief、Brush 这次都不装。

链接都在本次直接打开过，返回 200。仓库的许可证和最后提交时间来自 GitHub API。没有改项目文件，也没有调用付费生成。