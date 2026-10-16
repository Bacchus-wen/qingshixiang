这是只读调研：我先按 X 搜索的技能找近一年的做法和可用来源，再按对画面帮助的大小写进任务目录的 `result.md`。使用 agent-reach 做了体检：Twitter 通道没有可实时验证的登录态，`twitter-cli` 不在本机，任务也不许开浏览器，所以不走 OpenCLI。X 上的帖子用本会话的关键词和语义搜索，仓库用只读接口核对。检索窗口是 2025-10-17 到 2026-10-17。仓库和官方节点已经对上。cybercity 就是 r186 的 WebGPU/TSL，灯池、水膜和后期参数是从源码里读出来的。我按对这条雨夜街的帮助把结果写进任务目录。任务目录是只读的，文件写不进去。下面就是要交的 `result.md`。

# r15 X 调研：浏览器里的电影级雨夜霓虹

检索窗口：2025-10-17 至 2026-10-17。今天是 2026-10-17。

做法：agent-reach 体检里 Twitter 通道是 warn，当前 shell 没有 `twitter-cli`，任务禁止开浏览器，所以没有走 OpenCLI。X 帖来自本会话的关键词搜索和语义搜索。仓库用 `gh` 和 raw 源码只读核对，临时文件只在 `/tmp`，没有进项目目录，没有开浏览器，没有开 Blender。这台 Mac 上没有 search-hub 写的 `F:\搜索`。Agent Reach 当前是 v1.5.0，已是最新。

我们已有 SSR、TRAA、景深、泛光、AgX、体积光、GPU 雨、VAT 人群、楼体贴图集。对照现有源码：`ClusteredLighting`、灯池、朝上遮罩的 SSR、色相保留的 AgX、半分辨率 GTAO 已经接上。和 cybercity 还差的是灯有没有真的亮着、倒影有没有被拉成湿柏油、雾和雨有没有吃到这些灯的颜色。

先做三件现有栈里就能做的事：

1. 现在的灯池默认 64 盏、70 米外丢掉，而且候选要过「现在还亮着 × 0.5，或落在记忆光锥里」才有强度（`src/engine/LightPool.js`）。cybercity 是 200 盏、170 米、没有这道故事门。墙是黑的，多半是这道门把灯乘没了，不是缺 clustered。
2. SSR 已经按「光滑 × 朝上」在反射。缺的是 cybercity 那道竖向拉丝，以及按距离把照亮的画面混进雾里。
3. 雨现在主要吃两盏路灯聚光，霓虹颜色还要再过一遍记忆门（`src/systems/rain/neon.js`）。cybercity 的每滴雨直接吃离相机最近的 24 盏真灯。

---

## 1. 照亮墙和湿地面

### 1.1 cybercity 的灯池，以及我们已经抄到哪一步

- 来源：仓库 [xikhar/cybercity](https://github.com/xikhar/cybercity)（`three@0.186.1`，只依赖 three 和 Rapier，2026-10-13 仍在推）。读过 `src/engine/Engine.js`、`src/systems/signage/lights.js`、`src/systems/weather/lights.js`、`src/systems/weather/rain.js`。作者近帖是成品，没有拆管线：[City at night](https://x.com/xikhar/status/2105838937688400174)（2026-10-02）、[Tripo 再交给 Opus](https://x.com/xikhar/status/2106527292633825693)（2026-10-03）。
- 做法：`renderer.lighting = new ClusteredLighting()`。`LightPool` 默认 200 盏 `PointLight`，`castShadow = false`，decay 2。候选按距离、朝向、亮度打分，170 米外丢掉，每 20 帧重排。雨另走 `LightGather`：每 2 秒扫一遍点光和聚光，按「强度 × 范围 / 到相机距离」留下最多 24 盏。`rain.js` 写明每滴的颜色在 compute 里由这些灯算出来。我们的 `LightPool.js` 注释写明是照着这份做的，但默认 64 盏、70 米、每 8 帧重排，并且 `c.k = max(alive * 0.5, memory)`，`k < 0.02` 的候选直接不进排序。
- 对我们最有用的一点：现在态的招牌如果 `alive` 很低、又不在记忆光锥里，池子再加大也照不亮墙。要对齐 x-cyber 那种「墙上有彩色」，得让一部分池灯在现在态保持低强度，而不是只在记忆里全开。远景招牌继续用贴图自发光。
- WebGPU/TSL：能用，我们已在用。`Engine.js` 里是 `new ClusteredLighting(256, 32, 24, 64)`，只在 WebGPU 且质量不是 low 时打开。

### 1.2 官方 Forward+：ClusteredLighting 在，TiledLighting 已删

- 来源：r186 的 `examples/jsm/lighting/ClusteredLighting.js`，示例 [webgpu_lights_clustered](https://threejs.org/examples/webgpu_lights_clustered.html)。类注释：视锥切成屏幕块 × 指数深度切片，片元只算落到自己簇里的灯。默认最多 1024 盏点光，块 32px，24 层，每簇 64 盏。`TiledLighting.js` 在 r183 还在，2026-06-09 删除：[提交 8a03dbd，#33751](https://github.com/mrdoob/three.js/commit/8a03dbdfb898823686fd909f3b20ef661fa4d990)。
- 做法：赋给 `renderer.lighting`。类注释写的是点光。矩形光不走这条路径。
- 对我们最有用的一点：这条已经接上。默认上限 256 盖得住 64 到 200 的池子。活灯仍然用重排卡住，阴影继续关。
- WebGPU/TSL：能用。

同一目录的 `DynamicLighting.js`（示例 [webgpu_lights_dynamic](https://threejs.org/examples/webgpu_lights_dynamic.html)）把灯打进 uniform 数组，灯的数量变化时材质不用重编译。默认点光只有 16。我们的池子数量是固定的，用不上它来解决照亮。

旁证，不是 three.js：Alex Goldring 2026-01-10 在自研引擎 Shade 里用同样的 32px 分块加 Z 切片，一帧 5000 盏球灯，[帖子](https://x.com/SoftEngineer/status/2009933819093123503)。Babylon.js 2026-10-14 的 [文档帖](https://x.com/babylonjs/status/2110415888348291366) 只说明这是通行做法。两套都不能搬。

### 1.3 湿地面：粗糙度喂 SSR，再竖向拉丝

- 来源：cybercity 的 `src/materials/wet.js`、`src/engine/PostFX.js`。水膜注明来自 Sébastien Lagarde 的 Water drop 系列。
- 做法：积水处粗糙度混到 0.012，法线拉平。SSR 用粗糙度算出 gloss，再乘「法线有多朝上」。参数：半分辨率，`quality 0.5`，`maxDistance 140`，`thickness 0.12`，`maxLuminance 40`，`blurQuality 2`，`reflectNonMetals: true`。倒影再沿屏幕竖向做 7 点高斯拉丝，只加在朝上的表面上。透明的雨和雾用 `materialReference('transparent')` 把 G-buffer 的 alpha 写成 0，避免盖掉地面的法线。
- 我们这边：`PostFX.js` 已经把朝上程度写进金属粗糙缓冲的 b 通道，反射率是 `1 - smoothstep(0.04, 0.45, roughness)` 再乘朝上，`maxDistance 100`，`maxLuminance 40`，`thickness 0.15`。`reflectNonMetals` 是 false，但金属度入口喂的就是这个反射率，电介质仍然能反。合成时又乘了一次朝上。没有竖向拉丝，也没有按距离把画面模糊进雾里。
- 对我们最有用的一点：路如果像一面干净的镜子，缺的是那 7 点竖向拉丝，不是再把粗糙度往 0.012 压。同日的画面批判认为现行水坑已经太镜，目标图要的是碎倒影；拉丝同时接近 cybercity，也把整面镜子打碎。
- WebGPU/TSL：能用。官方示例 [webgpu_postprocessing_ssr](https://threejs.org/examples/webgpu_postprocessing_ssr.html)，另有 [webgpu_postprocessing_ssr_denoise](https://threejs.org/examples/webgpu_postprocessing_ssr_denoise.html)。

### 1.4 屏幕空间 GI 和官方辐照度探针

- 来源：官方 [webgpu_postprocessing_ssgi](https://threejs.org/examples/webgpu_postprocessing_ssgi.html)，示例里 `sliceCount` 2、`stepCount` 8，再接 `traa()`。Anderson Mancini，2026-05-25：[SSGI 加光探针](https://x.com/Andersonmancini/status/2058881650273013939)。他写运动时靠 SSGI，相机停下时烘探针补环境贴图；自写降噪没有公开仓库，帖子写 live link coming soon。Cody Bennett 2026-10-14：[SSGI 可以回退到光照贴图补漫反射，屏幕外的反射仍要立方体或反射探针](https://x.com/CodyBennett/status/2110276460652994968)。
- r186 的体积探针是 `examples/jsm/lighting/LightProbeGrid.js`，类注释写明辐照度探针网格，体积以物体位置为中心。示例 [webgpu_lightprobes](https://threejs.org/examples/webgpu_lightprobes.html)、[webgpu_lightprobes_sponza](https://threejs.org/examples/webgpu_lightprobes_sponza.html)。同版本有体素锥追踪 `examples/jsm/lighting/vxgi/`，示例 [webgpu_vxgi](https://threejs.org/examples/webgpu_vxgi.html)。这次没有跑帧时间。
- 对我们最有用的一点：探针和 SSGI 只反弹已经存在的光。现在态的灯被乘到接近 0 时，它们补不出霓虹。先让 1.1 的池灯有一点强度，再用 SSGI 补屏幕里的缝、用 `LightProbeGrid` 补灯不在画面里的那一面。整座城上的 VXGI 排在后面。暗部读不出材料，先靠一盏很暗的冷色环境，而不是再加一套 GI。
- WebGPU/TSL：官方 SSGI、`LightProbeGrid`、VXGI 都能用。Anderson 的降噪没有公开实现。

### 1.5 Speedball：世界空间漫反射 GI

- 来源：norio，2026-08-15，[帖子](https://x.com/norio/status/2088632808172626266)。演示 [norio.github.io/speedball-gi](https://norio.github.io/speedball-gi/)，仓库 [norio/speedball-gi](https://github.com/norio/speedball-gi)，npm `speedball-gi`。README：BVH 追踪的动态漫反射 GI，另外叠了 GTAO、TRAA、Bloom，没有 WebGL 回退。演示的 `package.json` 把 `three` 锁在 `0.185.1`，`three-mesh-bvh` 锁在 `0.9.14`。他写一加 bloom，three.js 的 TRAA 会闪，他改了 `TRAANode` 的闪烁抑制。这次没有和 r186 逐行对比那份补丁。
- Michel van den Berg 2026-09-28 在 three.js/WebGPU 里对比 DDGI、surfel 和世界空间 radiance cascades，[帖子](https://x.com/promontis/status/2104568297119166548)：场景大体静止、屏幕外的光很重要时，他手上的 DDGI 在缓存之后稍慢。这是他的实现，不是 speedball 的基准。
- 对我们最有用的一点：背对招牌的墙要靠世界空间探针才有颜色，但前提仍是那些招牌真的在发光。官方 `LightProbeGrid` 先试；speedball 要单独在 r186 上编译，演示锁的是 0.185.1。
- WebGPU/TSL：库本身是 WebGPU。和 r186 是否仍对得上，这次没有编译。

Cody Bennett 2025-12-23 的 [three-rc](https://github.com/CodyJasonBennett/three-rc) 是三维 radiance cascades，帖子写明是 WebGL。Ben Houston 2026-10-14 有一条分支：[bhouston/three.js radiance_cascades](https://github.com/bhouston/three.js/tree/radiance_cascades)。这次没有读完成度。

### 1.6 少量 LTC 矩形光，只给灯箱和那盏路灯

- 来源：官方 [webgpu_lights_rectarealight.html](https://github.com/mrdoob/three.js/blob/r186/examples/webgpu_lights_rectarealight.html)。`RectAreaLightNode.setLTC(RectAreaLightTexturesLib.init())`，然后普通 `RectAreaLight`。
- 做法：矩形光照在墙上是一块软的色斑。`ClusteredLighting` 的类注释只承诺点光。
- 对我们最有用的一点：街灯如果在地上是一块硬圆，点光池解决不了这个形状。那一两盏主灯改矩形光或加大半影，招牌的池子仍然是点光。
- WebGPU/TSL：示例就是 `WebGPURenderer`。几十盏矩形光不要指望进簇。

### 1.7 接触阴影

- 来源：r186 的 `SSSNode.js` 文件头写明这是 Screen-Space Shadows，补阴影贴图漏掉的小接触，并建议先用阴影贴图打底。示例 [webgpu_postprocessing_sss](https://threejs.org/examples/webgpu_postprocessing_sss.html)。次表面是另一个东西：`MeshSSSNodeMaterial`，示例 [webgpu_materials_sss](https://threejs.org/examples/webgpu_materials_sss.html)。
- 我们已有半分辨率 `ao()`（GTAO），半径 0.6、12 个采样。norio 2026-09-06 另发了从 `SSGINode` 抽出的 [GT-VBAO](https://github.com/norio/three-gtvbao)，演示 [norio.github.io/three-gtvbao](https://norio.github.io/three-gtvbao/)，描述写 WebGPU 和 WebGL2。peer 范围这次没有读到。
- 对我们最有用的一点：脚和轮胎先改网格落点。接触阴影和现有 GTAO 只补缝。次表面散射对这条街没有帮助。GTAO 光晕压不住时再看 GT-VBAO 或 [n8ao-webgpu](https://github.com/marioandf/n8ao-webgpu)。
- WebGPU/TSL：`SSSNode` 能用。它要一盏主方向光，满街点光时效果会弱。

---

## 2. 让画面像电影的后期

cybercity 的 `PostFX.js` 顺序是：场景 MRT → 半分辨率 SSR + 竖向拉丝 → 按距离把宽模糊混回去 → TRAA → 泛光 + 水平拉丝 → 径向色差 → 曝光 → 保色相的 AgX → 青阴影、暗角、颗粒。

文件里的数：曝光 0.82，泛光强度 0.32、半径 0.7、阈值 1.0、`smoothWidth 0.6`，颗粒 0.028，色差 0.00045，散射最大混合 0.16、每米 0.006，水平拉丝 0.06，色相保留 0.45。散射是四分之一分辨率的 `gaussianBlur`，再按视图距离指数混回。注释写明纯 AgX 会把饱和霓虹漂成白，所以和「只压最大通道再乘回色相」混 0.45。

我们的 `PostFX.js` 已经有色相保留 0.45、饱和度 1.12、颗粒 0.035、暗角、青阴影。泛光阈值是 1.4、强度 0.3，比 cybercity 更严，灯核更不容易把整个人烤亮。曝光乘在色调映射之前，和 cybercity 把曝光交给 `agxToneMapping` 的方式不一样。没有竖向拉丝、距离散射、径向色差、水平拉丝。

### 2.1 雨雾里的彩色散射

- 来源：cybercity `PostFX.js`。官方体积光示例还有 [webgpu_volume_lighting_traa](https://threejs.org/examples/webgpu_volume_lighting_traa.html)。
- 做法：把已经照亮的画面按距离模糊进空气。这和体积光柱是两件事。
- 对我们最有用的一点：体积光我们已经有。缺的是这层屏幕空间彩色雾。它只散射画面里真的亮的东西，所以仍然依赖 1.1 的灯是开着的。
- WebGPU/TSL：能用。

### 2.2 泛光、镜头光斑、水平拉丝

- 来源：官方 [webgpu_postprocessing_lensflare](https://github.com/mrdoob/three.js/blob/r186/examples/webgpu_postprocessing_lensflare.html)：`bloom` 之后 `lensflare`。另有 [bloom_emissive](https://threejs.org/examples/webgpu_postprocessing_bloom_emissive.html)、[bloom_selective](https://threejs.org/examples/webgpu_postprocessing_bloom_selective.html)、[anamorphic](https://threejs.org/examples/webgpu_postprocessing_anamorphic.html)。r186 的 `LensflareNode.js` 和这个示例里没有 `lensDirt` 导出。镜头污渍是自己用一张贴图乘在泛光上。
- 我们的泛光阈值已经是 1.4。再降到 cybercity 的 1.0 会让更多表面进泛光。
- 对我们最有用的一点：人和车如果变成整块霓虹，用 selective / emissive bloom 把它们挡在高通外面，而不是把阈值再降。水平拉丝和镜头光斑是灯核已经干净之后的一层。
- WebGPU/TSL：`BloomNode`、`LensflareNode` 都能用。

### 2.3 平面反射还是 SSR

- 来源：Anderson，2026-09-28，[回复](https://x.com/Andersonmancini/status/2104583403115004319)：路用官方 [webgpu_reflection_roughness](https://threejs.org/examples/?q=reflec#webgpu_reflection_roughness)，车漆用动态立方体贴图 [webgl_materials_cubemap_dynamic](https://threejs.org/examples/?q=dynamic#webgl_materials_cubemap_dynamic)。父帖是 Threejs Punk 发布，[2104564784377028636](https://x.com/Andersonmancini/status/2104564784377028636)。cybercity 的路面走 SSR，没有平面反射。
- 做法：粗糙度反射器能映出镜头背后的招牌。SSR 能映屏幕里的行人、车、机器人。两套都写进同一张颜色缓冲会重影。
- 对我们最有用的一点：先加 1.3 的竖向拉丝。消失点上的招牌仍然不进柏油时，再给路面加官方粗糙度反射器，只混在朝上、低粗糙度的像素上。
- WebGPU/TSL：两个官方示例都能用。`@react-three/drei` 的 `MeshReflectorMaterial` 导入的是 `WebGLRenderTarget`（读过 `src/core/MeshReflectorMaterial.tsx`），不能丢进节点材质。

### 2.4 色差、胶片颗粒、LUT

- 来源：`chromaticAberration`，示例 [webgpu_postprocessing_ca](https://threejs.org/examples/webgpu_postprocessing_ca.html)。`lut3D`，示例 [webgpu_postprocessing_3dlut](https://threejs.org/examples/webgpu_postprocessing_3dlut.html)。Sunag，2026-09-02，[Inspector 调色并可导出 LUT](https://x.com/sea3dformat/status/2095211083799703736)；2026-08-11 的 [3D LUT 生成器](https://x.com/sea3dformat/status/2087046640448209230)。r186 示例树里没有单独的 FilmGrain 节点。cybercity 和我们都是用 `hash` 自己写的。
- 对我们最有用的一点：色相保留已经是 0.45。色差和 LUT 是灯和倒影对了之后的最后一层。cybercity 的色差系数是 0.00045。
- WebGPU/TSL：色差节点和 `lut3D` 都能用。

### 2.5 雨后的水还留在表面上

- 来源：SkyeSharkie，2026-09-11，[Eanpa Sky 0.2.1](https://x.com/SkyeSharkie/status/2098425404591841298)。仓库 [SkyeShark/Eanpa-Sky](https://github.com/SkyeShark/Eanpa-Sky)，演示 [skyeshark.github.io/Eanpa-Sky](https://skyeshark.github.io/Eanpa-Sky/)。帖子写雨滴开始之后水坑会积起来。
- 我们的 `world.wetness` 和 `world.rain` 已经是两个数。
- 对我们最有用的一点：水坑不要每帧跟着雨开关。整包天空会和夜景抢环境光，只保留「湿度滞后」。
- WebGPU/TSL：作者声明就是 three.js。整包不要接。

---

## 3. 库和官方节点：r186 + TSL 能不能用

| 东西 | 结论 | 证据 |
|---|---|---|
| `ClusteredLighting` | 已在用 | 我们的 `Engine.js`，cybercity 同接口 |
| `DynamicLighting` | 能用，默认点光只有 16，解决的是重编译 | `DynamicLighting.js` |
| `TiledLighting` | 2026-06-09 起删除 | [8a03dbd](https://github.com/mrdoob/three.js/commit/8a03dbdfb898823686fd909f3b20ef661fa4d990) |
| `SSRNode` | 已在用；缺竖向拉丝 | 两边的 `PostFX.js` |
| `BloomNode`，含 emissive / selective | 能用；我们阈值已是 1.4 | 官方三个示例 |
| `TRAANode` | 已在用；和泛光叠用闪烁时看 norio 的补丁 | 帖子，补丁未逐行核对，演示锁 0.185.1 |
| `GTAONode` / `ao()` | 已在用 | 我们的 `PostFX.js` |
| `SSGINode` | 能用，只覆盖屏幕内，且只反弹已有的光 | 官方示例 |
| `LensflareNode` | 能用。r186 没有 `lensDirt()` | 官方示例和源码 |
| `ChromaticAberrationNode` | 能用，我们还没接 | `webgpu_postprocessing_ca` |
| `lut3D` | 能用，我们还没接 | `webgpu_postprocessing_3dlut` |
| `SSSNode`（接触阴影） | 能用 | 源码注释 |
| `MeshSSSNodeMaterial` | 能用，这条街用不上 | `webgpu_materials_sss` |
| `RectAreaLight` + LTC | 能用，少量 | `webgpu_lights_rectarealight` |
| 粗糙度平面反射 | 能用 | `webgpu_reflection_roughness` |
| `LightProbeGrid` | 能用 | `webgpu_lightprobes` |
| VXGI | 能用，比一条街的探针重 | `webgpu_vxgi` |
| `pmndrs/postprocessing` | 合成器绑在 `WebGLRenderer` 上 | README |
| `realism-effects` | 仓库停在 2024-02-04，建在 postprocessing 上 | `gh` 的 pushed_at |
| [n8ao-webgpu](https://github.com/marioandf/n8ao-webgpu) | TSL，peer `three@^0.182.0` | README 说原作者认可 |
| [three-gtvbao](https://github.com/norio/three-gtvbao) | TSL，描述写 WebGPU 和 WebGL2 | 2026-09-06 发布帖 |
| `three-gpu-pathtracer` | WebGPU 渐进式路径追踪 | README 写需要 WebGPU。Garrett 2026-10-07 仍说 Windows 编译慢，[帖子](https://x.com/garrettkjohnson/status/2107728587373838502)。可烘参考，不能当实时霓虹 |
| `three-mesh-bvh` | speedball 演示锁在 0.9.14 | 给 DDGI 和路径追踪做 BVH |
| `MeshReflectorMaterial` | 用 `WebGLRenderTarget` | drei 源码 |
| Cody 的 `three-rc` | 帖子写的是 WebGL | [帖子](https://x.com/CodyBennett/status/2003466174550679763) |

---

## 4. AI 生成 3D：X 上反复出现的管线

共识是把「分件、高模、减面、UV、贴图、绑定」拆开。kestrel 的质量来自 Blender 里的真实关节。它的构建包里能数到 `WebGLRenderer` 和 `MeshPhysicalMaterial`，没有 `WebGPURenderer`。

- 分件再进 Tripo：リダ，2026-10-15，[制作步骤](https://x.com/LidaMidorin/status/2110613666500673812)。脸、身体、头发、表情三视图、配件分开画，全部用 Tripo Smart Mesh P2.0，四边面大约 5000 到 10000；面数再高，校正时容易歪。然后在 Blender 里拼合，眼睛和手单独修，再上骨骼、权重、IK/FK。Tripo 官方转发了这条，[帖子](https://x.com/tripoai/status/2110946794519802042)。
- 多视图再进高模：Jerome，2026-01-20，[帖子](https://x.com/insaneUEFN/status/2013623255895081074)。Tripo 吃正视加侧视做高模；低模和自动 UV 用 Hunyuan 3D Studio；贴图用 ComfyUI 里的 Trellis 2。Scenario 的 Emm，2026-05-14，[帖子](https://x.com/emmanuel_2m/status/2055057268626829520)：一张图 → 多视图 → Tripo 3.1 高模 → 腾讯混元 Polygen 重网格和 UV → 再用 Tripo / Meshy / Trellis 重贴。
- 减面交给混元：Customuse，2026-10-16，[帖子](https://x.com/customuse/status/2111022156616221078)，Hi3D 高模 → 混元减面 → Tripo UV → Meshy 贴图。偏产品介绍，分工和 Jerome 一致。ery1one 同日一句 [「Tripo's retopo is pure garbage」](https://x.com/Andre782468/status/2111106088808714745)，没有对照图。
- 直接进 three.js：おのふみ，2026-10-16，[没做减面就进 Three.js](https://x.com/onofumi_AI/status/2111101702657241399)。Paweł，2026-10-16，[帖子](https://x.com/PawelJLisowski/status/2111147088302035240)：图像模型出概念，Tripo Studio 出模和绑定，Mixamo 动画，Claude 接到 three.js。xikhar，2026-10-04：基础绑定从 Tripo 导出，再到 Blender 修，[回复](https://x.com/xikhar/status/2106778442217947287)。Matt Collison，2026-10-11：Tripo P2 出模，底色用图像模型，法线和粗糙度另做，[帖子](https://x.com/MrCollison/status/2109367669795258588)。
- Rodin / Hyper3D：这次窗口里没有搜到一条带演示或仓库的分件流程。不能写成可用经验。
- 对我们最有用的一点：机器人和道具分件走「多视图 → Tripo P2（四边面大约 5k–10k）→ 混元低模和 UV → Meshy 或 Trellis 贴图 → Blender 修绑定」。Tripo 自动减面不要进正式资产。楼的贴图集不要用生成模型重做。关节、线缆、作动器学 kestrel，在 Blender 里做。进场景之后材质要写成节点材质，才能吃灯池和湿层。
- WebGPU/TSL：和渲染器无关。kestrel 的物理材质不能直接搬。

---

## 5. 质量最高的同类作品

只收近一年、能打开演示或仓库、并且作者写明是 three.js 的。按对我们画面的参考价值排。

1. **xikhar / NEON KAIDO（cybercity）** — 和我们对标的那条雨夜街，技术栈同为 r186 WebGPU/TSL。好在灯是重排过的点光池，雨的颜色从最近的灯来，湿柏油用粗糙度喂 SSR 再竖向拉丝。仓库即文档。[City at night](https://x.com/xikhar/status/2105838937688400174) 没有把管线再讲一遍。
2. **Anderson Mancini / Threejs Punk** — 2026-07-25 的雨巷，[帖子](https://x.com/Andersonmancini/status/2080975096848785673)，演示 [threejspunk.vercel.app](https://threejspunk.vercel.app/)。他列出动态雨、实时水坑、实时反射和光照、自定义后期、程序化镜头光斑；无烘焙光、无预渲染反射，并称多数设备 60 FPS，包体 15 MB。2026-09-28 他写明路是官方粗糙度反射器、车是动态环境贴图。2026-10-03 正式站 [threejspunk.com](https://www.threejspunk.com/)，[帖子](https://x.com/Andersonmancini/status/2106365002047488097)。2026-10-15 他写成 ThreeJS + WebGPU + 手改后期，[回复](https://x.com/Andersonmancini/status/2110839873531723906)。
3. **norio / Speedball GI** — 2026-08-15。好在墙的颜色来自间接光，并处理了 TRAA 加泛光的闪烁。适合看「灯不在画面里时墙应该是什么颜色」。演示锁 three 0.185.1。
4. **thtbee / Kestrel K-1** — 2026-10-14，[帖子](https://x.com/thtbee_/status/2110390964028330106)，演示 [thtbee.github.io/waggles/kestrel-k1](https://thtbee.github.io/waggles/kestrel-k1/)，仓库 [thtbee/waggles](https://github.com/thtbee/waggles) 的 `kestrel-k1/`，CC BY-NC 4.0。好在关节、线缆、作动器是真几何，玻璃、爆炸、剖面、涂装能切换。README 写 Three.js + TypeScript + Vite + Blender，大约 30 小时。构建包是 WebGL。机器人学结构，不学它的渲染器，它也没有城市。
5. **SkyeSharkie / Eanpa Sky** — 2026-09-11。好在雨开始之后水坑还留在表面上。天空不用搬。
6. **Anderson / 墓园弹球** — 2026-10-05，[帖子](https://x.com/Andersonmancini/status/2107091357386842549)，[graveyard-pinball.vercel.app](https://graveyard-pinball.vercel.app/)。WebGPU。适合看暗部怎样在局部光里仍然读得清。
7. **norio / GT-VBAO** — 2026-09-06。好在从 SSGI 里抽出一份更轻的接触变暗。给我们的是墙角和脚下的暗缝。
8. **xikhar / Tripo 角色原型** — 2026-10-03。好在生成角色进了浏览器，绑定在 Blender 里修过。光照仍要回到第 1 条的仓库。

明确不放进这张表的：2026-10 上大量「一个 HTML、一次提示、程序化霓虹城」的演示。帖子里看不到灯池和水膜。Shade 的 5000 盏灯和 Babylon 的 clustered lighting 是别的引擎。

---

## 6. 和我们当前栈的对应

已经接上、不用再接一遍的：`ClusteredLighting`、无阴影点光池、朝上遮罩的 SSR、G-buffer 不让雨覆盖法线、色相保留的 AgX、阈值泛光、颗粒、暗角、GTAO、`wetness` 和 `rain` 分开。

按对画面的帮助排，还值得做的是：

- 灯：看 `LightPool` 的 `alive * 0.5` 和记忆门。现在态留一批低强度的池灯，墙和湿地面才有颜色。池子从 64 / 70 米往 200 / 170 米加，只在候选本来就亮时才有用。远景继续自发光。主路灯的硬圆用一两盏 `RectAreaLight` 或更大的半影，不要靠加霓虹点光去抹。
- 地面：给现有 SSR 加 cybercity 的 7 点竖向拉丝。粗糙度不要再往 0.012 压。屏幕外的招牌仍不进柏油时，再混一层官方粗糙度平面反射。
- 空气和雨：加距离散射。雨的颜色改吃「当前真的亮着的池灯」，上限大约 24 盏。cybercity 近、中、远三层一共三十多万滴，那个数量不要照抄。记忆门外的死招牌继续不要给雨上色，否则现在态和记忆态会混成一块。
- 补光：灯有了强度之后，屏幕内用官方 SSGI，屏幕外用 `LightProbeGrid`。speedball 等在 r186 上编译过再接。
- 胶片：官方色差节点，系数参考 0.00045；需要锁颜色时再导出 LUT。镜头污渍用贴图乘泛光。
- 机器人：资产学 kestrel 的分件和 Blender 关节。脚下先改落点。材质写成节点材质。
- 先不要接：`pmndrs/postprocessing`、`realism-effects`、`MeshReflectorMaterial`、整包 Eanpa 天空、实时路径追踪、已删除的 `TiledLighting`。

这次没有在浏览器里打开任何演示。画面判断来自帖子、读过的 cybercity 源码，以及我们仓库里对应文件的现行写法。speedball 对 r186 的接口、norio 的 TRAA 补丁和 r186 的差异、`LightProbeGrid` 在一条街上的烘培耗时，都还没有实测。