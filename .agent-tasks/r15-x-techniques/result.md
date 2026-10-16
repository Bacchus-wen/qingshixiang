这是只读调研：我先按团队任务板和检索规范定位 r15 的任务目录，再去 X 上找近一年可复现的霓虹雨夜城市做法。使用 agent-reach 的 Twitter 通道做体检；本机没有可用的 twitter-cli 登录态，而且任务禁止开浏览器。接下来用 X 检索和公开仓库页核对近一年的做法。对照仓库已经对上：`xikhar/cybercity` 用的就是 r186 的 `ClusteredLighting`，湿地面靠粗糙度薄膜喂给 SSR，再在后期里把灯色散进雨雾。我把按收益排序的做法写进任务目录。# r15 X 调研：浏览器里的电影级雨夜霓虹

检索窗口：2025-10-17 至 2026-10-17。今天是 2026-10-17。

做法：agent-reach 体检里 Twitter 通道是 warn，当前 shell 没有 `TWITTER_AUTH_TOKEN` / `TWITTER_CT0`。任务禁止开浏览器，所以没有走 twitter-cli，也没有走 OpenCLI。X 上的帖子来自关键词和语义搜索。仓库用 `gh api` 只读，临时文件只放在 `/tmp`，没有进项目目录，没有开浏览器，没有开 Blender。这台 Mac 上没有 search-hub 写的 `F:\搜索`。

我们已有 SSR、TRAA、景深、泛光、AgX、体积光、GPU 雨、VAT 人群、楼体贴图集。下面按「补上和 x-cyber / cybercity / kestrel 的差距」排序。差距在第三轮评审里是：招牌颜色没有铺到墙和湿柏油上，雨是灰的，人车成了整块霓虹，机器人脚不沾地。

先做三件事，都在现有 WebGPU + TSL 栈里：

1. `renderer.lighting = new ClusteredLighting()`，招牌用无阴影的点光源池，按镜头重排。
2. 地面走水膜粗糙度，SSR 的金属度入口改成「光滑 × 朝上」，再把倒影沿屏幕竖向拉丝。
3. 用距离雾把已经照亮的颜色散进空气；AgX 保留色相；泛光只吃超过阈值的核，再加镜头污渍。

---

## 1. 照亮墙和湿地面

### 1.1 cybercity 的灯池 + ClusteredLighting

- 来源：仓库 [xikhar/cybercity](https://github.com/xikhar/cybercity)（`three@0.186.1`，只依赖 three 和 Rapier）。`src/engine/Engine.js`、`src/systems/signage/lights.js`、`src/systems/weather/lights.js`。作者近帖是成品而不是拆解：[City at night](https://x.com/xikhar/status/2105838937688400174)（2026-10-02）、[Tripo 模型再交给 Opus](https://x.com/xikhar/status/2106527292633825693)（2026-10-04）。
- 做法：`renderer.lighting = new ClusteredLighting()`，注释写明支撑几百盏点光源。招牌不是一盏灯一个对象一直开着。`LightPool` 默认 200 盏 `PointLight`，`castShadow = false`，decay 2。几百个候选按距离、朝向、亮度打分，每 20 帧重排，只把最相关的绑到这 200 盏上，170 米外丢掉。雨、水花、蒸汽另走 `LightGather`：每 2 秒扫一遍点光/聚光，按「强度 × 范围 / 到相机距离」留下最多 24 盏，写进 `uniformArray`，粒子着色器自己取样。雨丝颜色来自这些灯，不是来自一张灰雾。
- 对我们最有用的一点：楼体贴图集只负责招牌自己发光。墙面和雨要变色，得有真实点光，而且数量用重排卡住。200 盏无阴影，比「每块招牌一盏还投影」便宜，也比纯自发光能照到墙。
- WebGPU/TSL：能用。官方接口就是给 `WebGPURenderer` 的。见下条。

### 1.2 官方 Forward+ ClusteredLighting（Tiled 已删除）

- 来源：PR [#33406](https://github.com/mrdoob/three.js/pull/33406)（2026-04-17 合入，里程碑 r185）。文档 [ClusteredLighting](https://threejs.org/docs/pages/ClusteredLighting.html)（页上日期 2026-09-04）。示例 [webgpu_lights_clustered](https://threejs.org/examples/webgpu_lights_clustered.html)。r186 更新说明里有「Improve performance of clustered lights demo」。Sunag 在 2026-06-09 删掉了 `TiledLighting`：[PR #33751](https://github.com/mrdoob/three.js/pull/33751)，理由是把力气集中到 clustered。
- 做法：`import { ClusteredLighting } from 'three/addons/lighting/ClusteredLighting.js'`，赋给 `renderer.lighting`。视锥切成屏幕块 × 指数深度切片，compute 做球与 AABB，片元只算落到自己簇里的灯。默认最多 1024 盏点光，块大小 32px，24 层深度，每簇 64 盏。旧的 2D tiled 会把同一像素上、深度不同的灯算在一起，街谷里会错；clustered 用 z 切片分开。
- 对我们最有用的一点：这是 r186 上「很多霓虹同时照亮墙」的官方做法，cybercity 已经在用。合入讨论里 Mugen87 的 Mac mini 跑满演示大约 9 FPS，所以要学 cybercity 把活灯压在 200、阴影关掉，而不是把 1024 盏都开阴影。
- WebGPU/TSL：能用，就是 TSL 光照节点。2026-07 有过「设了 `scene.environment` 后点光源全黑」的报告，对象是已经删除的 `TiledLightsNode`（[#34003](https://github.com/mrdoob/three.js/issues/34003)）。换上 ClusteredLighting 之后，用我们自己的环境贴图看一次灯还在不在。

### 1.3 湿地面把粗糙度压成水膜，SSR 才吃得进

- 来源：同一仓库 `src/materials/wet.js`、`src/systems/ground/roadMaterial.js`、`src/engine/PostFX.js`。水膜模型注明来自 Sébastien Lagarde 的 Water drop 系列。
- 做法：`applyWetness` 包住已有的 color / roughness / normal。孔隙处反照率变暗；粗糙度被湿润度拉向一层薄膜（道路上大约是原粗糙度 × 0.24 + 0.04），积水处法线拉平，雨涟漪只留很小的扰动。路面粗糙度最后夹在 0.012 到 1。SSR 不用材质金属度当开关。他们用粗糙度算出 gloss，再乘「法线有多朝上」：地面反射强，墙和玻璃弱（竖直面上的 SSR 会糊），粗糙表面直接不走 SSR，交给环境贴图。`ssr()` 参数：半分辨率，`quality 0.5`，`maxDistance 140`，`thickness 0.12`，`maxLuminance 40`，`blurQuality 2`，`reflectNonMetals: true`。倒影再沿屏幕竖向做 7 点高斯拉丝，只加在朝上的表面上，模仿湿柏油的各向异性微表面。透明物体（雨、雾）用 `materialReference('transparent')` 把 G-buffer 的 alpha 写成 0，混合模式让它们不盖掉不透明的法线和粗糙度，否则 SSR/TRAA 会用雨的法线去涂地。
- 对我们最有用的一点：第三轮里路不倒影，和「有 SSR」不矛盾。金属度门控会让柏油几乎不反射；法线扰得太厉害，倒影会被撕碎。先把水膜粗糙度和朝上权重接上，再谈新算法。
- WebGPU/TSL：能用。`ssr` 来自 `three/addons/tsl/display/SSRNode.js`。官方示例 [webgpu_postprocessing_ssr](https://github.com/mrdoob/three.js/blob/dev/examples/webgpu_postprocessing_ssr.html) 用 MRT 把金属度/粗糙度打包进一张附件，粗糙度选模糊 mip（[#31649](https://github.com/mrdoob/three.js/pull/31649)，2025-08，早于窗口，但是 r186 里的现行行为）。

### 1.4 屏幕空间 GI 和探针：补点光打不到的那一面

- 来源：官方 [webgpu_postprocessing_ssgi](https://threejs.org/examples/webgpu_postprocessing_ssgi.html)（r186 包，`ssgi()` + `traa()`，示例里 sliceCount 2、stepCount 8，GI 乘 diffuse 再加 AO）。Anderson Mancini，2026-05-25：[SSGI 加光探针](https://x.com/Andersonmancini/status/2058881650273013939)。相机停下时烘探针，填一张环境贴图；他自写的降噪不再把 AO 糊掉。
- 做法：SSGI 只看见屏幕里已经画出来的像素。招牌在镜头背后或在墙的另一侧时，墙上没有那块颜色。Anderson 的补法是：运动时靠 SSGI，静止时用探针平均值补环境。Matt Collison 2026-05-24 贴过 WebGPU 探针网格，[帖子](https://x.com/MrCollison/status/2058563939856723997) 说烘培和 WebGL 版相同，差在 TSL 取样；仓库链接在帖子里被截断，这次没有打开到实现。
- 对我们最有用的一点：走路镜头不要等「停下再烘」。墙的主色仍靠 1.1 的点光。SSGI 用来补缝、补柱子背面那一点漏光。官方 `LightProbeGenerator.js` 仍在 r186 的 `examples/jsm/lights/`。r186 说明里 WebGL 的 `LightProbeGrid` 改名为 `LightProbeGridWebGL`（[zao3d 对 r186 的整理](https://zao3d.com/three-js-r186-una-gran-actualizacion-en-shaders-materiales-e-iluminacion/)，2026-10-08）；这次没有核对是否另有一份 WebGPU 探针网格类。
- WebGPU/TSL：官方 SSGI 能用。Anderson 的降噪是他自己的，帖子写 live link coming soon，没有可抄的仓库。

### 1.5 Speedball：世界空间漫反射 GI（屏幕外的霓虹也能照墙）

- 来源：norio，2026-08-15，[帖子](https://x.com/norio/status/2088632808172626266)。演示 [norio.github.io/speedball-gi](https://norio.github.io/speedball-gi/)，仓库 [norio/speedball-gi](https://github.com/norio/speedball-gi)。上游 [cl0nazepamm/speedball](https://github.com/cl0nazepamm/speedball)，npm `speedball-gi`。作者 2026-08-20 又发了一版更稳的 [cl0nazepamm.github.io/speedball](https://cl0nazepamm.github.io/speedball/)。
- 做法：BVH 追踪的动态漫反射 GI（DDGI）。`installSpeedballGI({ renderer, scene, camera, ... })` 必须在第一次 `render` / `setAnimationLoop` 之前调用，因为它会换掉灯光节点。依赖 `three-mesh-bvh`。声明支持 `three >=0.185.0 <0.187.0`，正是 r186。norio 在上面又叠了官方 `GTAONode`、`TRAANode`、`BloomNode`。他写明：一加 bloom，three.js 的 TRAA 会闪，他改了 `TRAANode` 的闪烁抑制，改过的文件在他的仓库里。这次没有逐行 diff 那份补丁。
- 对我们最有用的一点：点光池照的是灯的正面。巷子里背对招牌的墙，要靠这种探针体积才会有颜色。比 SSGI 更适合「灯不在屏幕里」。代价是多一套 BVH，几何大改时要等空闲再重建。
- WebGPU/TSL：能用。WebGL2 要 `WebGPURenderer({ forceWebGL: true })` 加 `EXT_color_buffer_float`，经典 `WebGLRenderer` 不支持。

### 1.6 少量 LTC 矩形光，只给橱窗和灯箱

- 来源：官方示例 [webgpu_lights_rectarealight.html](https://github.com/mrdoob/three.js/blob/dev/examples/webgpu_lights_rectarealight.html)。`RectAreaLightNode.setLTC(RectAreaLightTexturesLib.init())`，然后普通 `RectAreaLight`。
- 做法：矩形光用 LTC 贴图，照在墙上是一块软的色斑，比点光更像灯箱。`ClusteredLighting` 的文档写的是点光上限，这次没有证明矩形光会进那个簇。英雄招牌用几盏矩形光，其余仍走点光池。
- 对我们最有用的一点：大灯箱如果只用点光，墙中心会亮一个圆。一两块主招牌改矩形光，墙的受光形状就对了。
- WebGPU/TSL：示例就是 `WebGPURenderer`。不要把几十盏矩形光塞进簇里指望自动加速，文档没有这么写。

### 1.7 自发光代替真灯：只适合远景

- 来源：Naoya，2026-10-13，讲的是虚幻里 11000 块招牌：[帖子](https://x.com/NaoyaCreates/status/2109956632360992969)。做法是合并网格、不投影、不碰撞，发光交给 Lumen。Grok 的转述在同一串里，不当作独立证据。Babylon 2026-10-14 的 [clustered lighting 文档帖](https://x.com/babylonjs/status/2110415888348291366) 是另一条引擎，只能当「簇光照是通行做法」的旁证。
- 做法：远景窗户和消失点上的招牌继续用贴图自发光加泛光。近景墙和地面要有 1.1 的真灯，否则湿地面没有可反射的彩色光源。
- 对我们最有用的一点：贴图集继续负责远景密度。近景缺的是灯，不是更多发光贴图。
- WebGPU/TSL：自发光贴图我们已经在用。Lumen 那套不能搬。

### 1.8 接触阴影，让机器人脚和轮胎粘在地上

- 来源：文档 [SSSNode](https://threejs.org/docs/pages/SSSNode.html)（2026-10-04）。这里的 SSS 是 Screen-Space Shadows，接触阴影，不是次表面散射。`import { sss } from 'three/addons/tsl/display/SSSNode.js'`。次表面是另一个东西：`MeshSSSNodeMaterial`，示例 [webgpu_materials_sss.html](https://github.com/mrdoob/three.js/blob/dev/examples/webgpu_materials_sss.html)。
- 做法：`sss(depth, camera, mainLight)` 补阴影贴图漏掉的小接触。第三轮里脚和轮胎悬空，先改网格落点；接触阴影只能掩盖剩下的一条缝。
- 对我们最有用的一点：脚落地之后，接触阴影能把机器人和地面连上。次表面散射对这条雨夜街没有帮助。
- WebGPU/TSL：接触阴影节点能用。它要一盏主方向光；我们的街灯是很多点光，效果会弱于单太阳场景。

---

## 2. 让画面像电影的后期

cybercity 的 `PostFX.js` 把头注释写成了顺序。渲染器自身是 `NoToneMapping`，色调映射放在这条链的后段：

场景 MRT（颜色、法线、金属/粗糙、速度）→ 半分辨率 SSR + 竖向拉丝 → 按距离把宽模糊混回去（雨雾里的光晕）→ TRAA → 泛光 + 轻微变形宽银幕拉丝 → 径向色差 → 曝光 → 保色相的 AgX → 青阴影/品红高光、暗角、胶片颗粒。

关键数：曝光 0.82，泛光强度 0.32、半径 0.7、阈值 1.0、`smoothWidth 0.6`，颗粒 0.028，色差 0.00045，散射最大混合 0.16、每米 0.006，变形宽银幕 0.06，色相保留 0.45。散射是 `gaussianBlur(lit, vec2(2), 6, { resolutionScale: 0.25 })`，再按视图距离指数混回。注释写明：纯 AgX 会把饱和霓虹过早漂成白，所以和「只压最大通道、再把色相乘回去」混 0.45。

### 2.1 雨雾里的彩色散射（比再加一层体积光更对症）

- 来源：上面的 `PostFX.js`。Eanpa Sky 做的是完整天气，见 2.6。
- 做法：体积光我们已经有。cybercity 另外把「已经照亮的画面」按距离模糊进空气，所以远处霓虹会晕开成雾的颜色，而不是一条灰体积柱。
- 对我们最有用的一点：第三轮里雨是灰线、雾是白的。把灯色散进雾，雨和空气会一起变色。这比再买一个体积云库便宜。
- WebGPU/TSL：能用，全是 TSL 节点（`gaussianBlur`、`getViewZNode`）。

### 2.2 泛光只吃亮核，再加镜头光斑和污渍

- 来源：官方 [webgpu_postprocessing_lensflare.html](https://github.com/mrdoob/three.js/blob/dev/examples/webgpu_postprocessing_lensflare.html)。`bloom(emissivePass)` 之后 `lensflare(bloomPass, …)`，另有 `lensDirt(bloomPass, texture(lensDirtMap), intensity)`。Anderson 的雨巷帖把「程序化镜头光斑」列为无烘焙、60 FPS 的一项，见第 5 节。
- 做法：阈值泛光（cybercity 阈值 1.0）让招牌核发光，墙保持暗。镜头污渍贴图乘在泛光上，雨夜会有水滴光斑。变形宽银幕是对泛光再做水平拖影，cybercity 用 10 点、略偏蓝的权重。
- 对我们最有用的一点：现在的泛光如果把整条街抬亮，人和车会变成第三轮看到的整块霓虹。把阈值抬到只剩灯核，颜色留在 AgX 的色相保留里。
- WebGPU/TSL：`BloomNode`、`LensflareNode` 都能用。`pmndrs/postprocessing` 的 Bloom 是 WebGL，不要并行开两套。

### 2.3 平面反射还是 SSR

- 来源：Anderson，2026-09-28，[回复](https://x.com/Andersonmancini/status/2104583403115004319)：路用官方 [webgpu_reflection_roughness](https://threejs.org/examples/?q=reflec#webgpu_reflection_roughness)，车漆用动态立方体贴图 [webgl_materials_cubemap_dynamic](https://threejs.org/examples/?q=dynamic#webgl_materials_cubemap_dynamic)。这条是回复，父帖这次没有展开，不能当成 threejspunk 的全部管线。NA，2026-05-24，水同时做平面反射和 SSR：[帖子](https://x.com/NA_DEGEN_GIRL/status/2058540859357044831)，仓库 [NA-DEGEN-GIRL/wave-three-js](https://github.com/NA-DEGEN-GIRL/wave-three-js)。
- 做法：平面反射（或带粗糙度模糊的 Reflector）能映出镜头背后的招牌，一条直街特别明显。SSR 能映屏幕里的行人、车、机器人，映不到屏幕外，掠射角也容易断。cybercity 选择 SSR + 竖向拉丝 + 朝上遮罩，没有用平面反射。Anderson 的路用的是官方粗糙度反射器。
- 对我们最有用的一点：先把 1.3 的 SSR 权重和粗糙度接上，因为对照片就是这条。若消失点上的招牌仍然不进柏油，再给路面加一张低分辨率的粗糙度平面反射，只混在朝上、低粗糙度的像素上。两套都开时，平面反射不要再写进 SSR 的颜色缓冲，否则会重影。
- WebGPU/TSL：`webgpu_reflection_roughness` 和 `SSRNode` 都能用。`@react-three/drei` 的 `MeshReflectorMaterial` 继承 `MeshStandardMaterial` 并改 GLSL 片元，见 [drei 文档](https://pmndrs.github.io/drei/shaders/mesh-reflector-material)（页上日期 2026-10-13）。它不是 TSL 节点，不能丢进 `WebGPURenderer` 的节点材质。

### 2.4 色差、胶片颗粒、LUT

- 来源：色差和颗粒在 cybercity `PostFX.js` 里用 TSL 写完（径向偏移、按亮度加权的 hash 颗粒）。LUT：Sunag，2026-09-02，[Inspector 调色并可导出 LUT](https://x.com/sea3dformat/status/2095211083799703736)；2026-08-11 的 [3D LUT 生成器](https://x.com/sea3dformat/status/2087046640448209230)。
- 做法：色差系数要很小（他们是 0.00045 再乘径向的三次项），只在画面边缘分开 RGB。颗粒压在中间调，大约 0.03。LUT 放在色调映射之后，用来锁青阴影和暖灯，而不是代替曝光。
- 对我们最有用的一点：AgX 已经有了。先加 cybercity 那种色相保留（大约 0.45），再考虑导出一张 LUT。颗粒和色差是最后 5% 的胶片感，解决不了墙不亮。
- WebGPU/TSL：能用。这次没有找到官方的 `ChromaticAberrationNode`；十几行 TSL 就够。LUT 走 Inspector 的调色扩展。

### 2.5 TRAA 和泛光叠在一起会闪

- 来源：norio 同上，以及他 2026-08-16 的前后对比（线程里的 [2088901564841030072](https://x.com/norio/status/2088901564841030072)）。改过的 `TRAANode` 在 [norio/speedball-gi](https://github.com/norio/speedball-gi)。
- 做法：泛光会把时域里差一两个像素的亮点放大成闪烁。他改的是 TRAA 的闪烁抑制，不是把泛光关掉。
- 对我们最有用的一点：我们已有 TRAA 和泛光。霓虹闪烁若在加泛光之后出现，先看这份补丁，再考虑关时域。
- WebGPU/TSL：补丁针对官方 `TRAANode`，能用在我们的链上。合入前要对照 r186 的现行文件，他的演示锁的是 0.185 附近。

### 2.6 彩色体积天气：Eanpa Sky（整包太重，抽湿度和雨）

- 来源：SkyeSharkie，2026-08-03，[发布帖](https://x.com/SkyeSharkie/status/2084415135331024919)。仓库 [SkyeShark/Eanpa-Sky](https://github.com/SkyeShark/Eanpa-Sky)。CHANGELOG 写 0.2.1 在 2026-09-12 升到 three 0.186.0。Token Gremlin 的转发（[2084439205501895161](https://x.com/TokenGremlin/status/2084439205501895161)）是二手，以仓库为准。
- 做法：体积云、云影、闪电、多档性能。和雨夜直接相关的是：雨按表面暴露和坡度落下；湿度和水坑会在云移走之后还留着；PBR 反射把屏幕空间、本地探针和天空环境合在一起，并用运动/深度把高光条纹压住。
- 对我们最有用的一点：水坑不要每帧跟着雨开关。雨停之后地面仍该是湿的，倒影才稳。云和环世界天空不用搬。
- WebGPU/TSL：能用，作者声明就是 three.js WebGPU/TSL，并跟过 r186。它是一整套天空，和我们的街景灯会抢环境光，整包接进来会把夜景照亮。

---

## 3. 库和官方节点：r186 + TSL 能不能用

| 东西 | 结论 | 证据 |
|---|---|---|
| `ClusteredLighting` | 能用，优先 | 文档与 cybercity `Engine.js` |
| `TiledLighting` | r185 起已删除 | [PR #33751](https://github.com/mrdoob/three.js/pull/33751)（2026-06-09） |
| `SSRNode` / `ssr()` | 能用 | 官方示例 + cybercity |
| `BloomNode` / `bloom()` | 能用 | 官方镜头光斑示例、cybercity |
| `TRAANode` / `traa()` | 能用；和泛光叠用要看闪烁补丁 | norio |
| `GTAONode` / `ao()` | 能用 | [webgpu_postprocessing_ao.html](https://github.com/mrdoob/three.js/blob/dev/examples/webgpu_postprocessing_ao.html)，可在 GTAO 和 SSAO 间切换。2026-05 的 [#33654](https://github.com/mrdoob/three.js/pull/33654) 改了斜面上的权重 |
| `SSGINode` / `ssgi()` | 能用，只覆盖屏幕内 | 官方示例 |
| `LensflareNode` + `lensDirt` | 能用 | 官方示例 |
| `SSSNode`（接触阴影） | 能用 | 2026-10-04 文档 |
| `MeshSSSNodeMaterial`（次表面） | 能用，这条街用不上 | `webgpu_materials_sss.html` |
| `RectAreaLight` + LTC | 能用，少量 | `webgpu_lights_rectarealight.html` |
| 粗糙度平面反射 | 能用 | `webgpu_reflection_roughness` |
| 延迟着色示例 | r186 新加了 `webgpu_deferred` | 更新说明 [#34049](https://github.com/mrdoob/three.js/pull/34049)。cybercity 仍用前向 clustered。灯数先用池子卡住，再考虑延迟 |
| `pmndrs/postprocessing` | 不能丢进 WebGPURenderer | README 仍是 `WebGLRenderer` + EffectComposer（LUT、色差、噪声、泛光都在里面）。想法用 TSL 重写，不要两套合成器 |
| `realism-effects` | 这次没有找到 WebGPU 移植 | 它建在 postprocessing 上。SSGI、TRAA、泛光已有官方 TSL 节点 |
| N8AO 原版 | WebGL | — |
| [marioandf/n8ao-webgpu](https://github.com/marioandf/n8ao-webgpu) | TSL 移植，作者说 N8python 认可 | Andrew Flowers，2026-04-21，[帖子](https://x.com/AndrewFlowersMD/status/2046664491870376162)。peer 写 `three@^0.182.0`，范围盖住 0.186。官方 GTAO 已经够用；这个只在 GTAO 光晕压不住时再试 |
| `three-gpu-pathtracer` | WebGPU 能用，不适合每帧游戏 | Garrett Johnson，2026-09-29 合入并发布，[帖子](https://x.com/garrettkjohnson/status/2104813951506940229)，[仓库](https://github.com/gkjohnson/three-gpu-pathtracer)。渐进式路径追踪，可拿来烘参考图，不能当实时霓虹 |
| `three-mesh-bvh` | 能用，给 Speedball 和路径追踪做 BVH | speedball 的 peer 是 `>=0.9.11 <0.10.0` |
| `MeshReflectorMaterial` | 不能用在节点材质上 | drei，GLSL |
| `@pmndrs/sky` | 能用在 r186 | npm 0.6.0，页上日期约 2026-10-13，peer `three >=0.186`。`GroundedSkybox({ reflective: true })` 把环境立方体折到地面，可当「屏幕外霓虹」的廉价倒影。白天太阳天空会毁掉夜景，只用反射地面那一层 |
| `@pmndrs/upscaler` | 能用，r186+ | npm 0.5.0，约 2026-10-07。半分辨率的 SSR/SSGI/GTAO 可以交给它拉回全分辨率。等倒影内容对了再加，否则只是把糊的倒影放大 |
| `pmndrs/denoiser` 的 `ffxReflections()` | 搜索摘要说有 TSL 节点，这次没有打开完整 README 以外的源码 | 当「SSR 太噪再看」的候选，不排进第一批 |

---

## 4. AI 生成 3D：X 上反复出现的管线

共识是把「高模、减面、UV、贴图」拆开，不要信一家的自动减面。机器人除外：kestrel 的质量来自 Blender 里的真实关节，不是一次生成。

- 分件生成：Stefan，2026-08-10，[Tripo P2.0](https://x.com/Stefan_3D_AI/status/2086860435496763583)。他说大约 95% 的网格可用，而且每个部件是单独物体；剩下的坑在 Blender 里用 RetopoFlow 修几分钟。对我们：机器人、车、摊位按部件出，不要一整条街一次生成。
- 多视图再进高模：Jerome，2026-01-20，[帖子](https://x.com/insaneUEFN/status/2013623255895081074)。Tripo 吃正视+侧视最好；低模和自动 UV 用 Hunyuan 3D Studio；贴图用 ComfyUI 里的 Trellis 2 再放大到 2K。Scenario 的 Emm，2026-05-14，[帖子](https://x.com/emmanuel_2m/status/2055057268626829520)：一张图 → 多视图 → Tripo 3.1 高模 → 腾讯混元 Polygen 重网格和 UV → 再用 Tripo / Meshy / Trellis 重贴。
- 减面：ery1one，2026-10-16，一句 [「Tripo 的 retopo 很差」](https://x.com/Andre782468/status/2111106088808714745)，没有对照图，只当作和上面「减面交给混元」一致的牢骚。Customuse 同日写的链是 Hi3D 高模 → 混元减面 → Tripo UV → Meshy 贴图（[帖子](https://x.com/customuse/status/2111022156616221078)），偏广告，步骤和 Jerome 相同。
- 直接进 three.js：おのふみ，2026-10-16，[Tripo 进 Three.js，没做减面](https://x.com/onofumi_AI/status/2111101702657241399)，面数上来再减。Paweł，2026-10-16：概念图用图像模型，Tripo Studio 出模和绑定，Mixamo 动画，Claude 接到 three.js。xikhar，2026-10-04：Tripo 出角色，Opus 写 three.js 原型。
- 对我们最有用的一点：道具和机器人分件走「多视图 → Tripo 高模（要分件）→ 混元低模和 UV → 我们自己或 Meshy 贴图 → three.js」。Tripo 自动减面不要进正式资产。楼已经有贴图集，不要用 AI 重做整栋楼。
- WebGPU/TSL：和渲染器无关。进场景的是 glTF，材质仍走节点材质才能吃第 1 节的灯和湿层。

---

## 5. 质量最高的同类作品

只收近一年、能打开演示或仓库、并且看得出是 three.js 的。按对我们画面的参考价值排。

1. **xikhar / NEON KAIDO（cybercity）** — 和我们对标的那条雨夜街，技术栈同为 r186 WebGPU/TSL。好在灯是重排过的点光池，雨的颜色从这 24 盏灯来，湿柏油用粗糙度喂 SSR 再竖向拉丝。仓库即文档，X 上他没有把这条管线再讲一遍。
2. **Anderson Mancini / Threejs Punk** — 2026-07-25，[帖子](https://x.com/Andersonmancini/status/2080975096848785673)，演示 [threejspunk.vercel.app](https://threejspunk.vercel.app/)。一条雨巷，15 MB，无烘焙光、无预渲染反射，动态雨、实时水坑、实时反射、程序化镜头光斑，作者称多数设备 60 FPS。2026-10-03 他写 FWA 当日站点并开放多人：[帖子](https://x.com/Andersonmancini/status/2106365002047488097)。这是「一条巷做到电影」而不是「一整座城」的上限。
3. **norio / Speedball GI 演示** — 2026-08-15。好在墙的颜色来自间接光，GTAO 把接触压暗，TRAA+泛光还压住了闪烁。适合看「灯不在画面里时墙应该是什么颜色」。
4. **thtbee / Kestrel K-1** — 2026-10-14，[帖子](https://x.com/thtbee_/status/2110390964028330106)，演示 [thtbee.github.io/waggles/kestrel-k1](https://thtbee.github.io/waggles/kestrel-k1/)，仓库 [thtbee/waggles](https://github.com/thtbee/waggles) 里的 `kestrel-k1/`（作者写这是构建产物，CC BY-NC 4.0）。好在每个关节、线缆、作动器都是真几何，玻璃、爆炸、剖面、涂装能切换。README 写 Three.js + TypeScript + Vite + Blender，30 小时迭代；这次没有从压缩包里确认它是 WebGPU 还是 WebGL。机器人该学这个结构，不该学它的城市光照（它没有城市）。
5. **SkyeSharkie / Eanpa Sky** — 2026-08 发布，2026-09 跟到 r186。好在雨后的湿度还留在表面上，反射同时用了屏幕空间、探针和天空，亮斑不拉成条。
6. **NA / wave-three-js** — 2026-05-24。好在同一套 TSL 水里平面反射和 SSR 并存，船会推波、泡沫会留下。给我们的是路面反射的参照，不是海。
7. **Anderson / 墓园弹球** — 2026-10-05，[帖子](https://x.com/Andersonmancini/status/2107091357386842549)，[graveyard-pinball.vercel.app](https://graveyard-pinball.vercel.app/)。WebGPU，暗场景里局部光和接触读得很清楚。和雨夜街的关系弱，适合看「暗部不要被泛光抬死」。
8. **xikhar / City at night** — 2026-10-02 那条帖。Blender、图像生成和 three.js 从零搭的夜城，能在浏览器里跑。他没有写渲染细节；同月的 Tripo 帖说明角色资产是生成的，场景几何仍经过 Blender。

明确不放进这张表的：2026-10 上大量「一个 HTML、一次提示、程序化霓虹城」的演示（GLM、Gemini、Claude 对打）。它们证明提示词能堆窗户和泛光，灯没有打到墙上，也没有 cybercity 那种水膜和灯池。Usnul 的 [queep-3-arena](https://github.com/Usnul/queep-3-arena)（2026-08-28，[帖子](https://x.com/SoftEngineer/status/2093331340330410319)）有 326 盏簇光照和 SH3 光照贴图，但是 Quake 的 WebGPU 移植，不是 three.js。

---

## 6. 和我们当前栈的对应

已经有的东西不用换库。要改的是接线：

- 灯光：加上 `ClusteredLighting` 和约 200 盏无阴影点光池。远景招牌继续自发光。
- 地面：水膜粗糙度（积水可以到 0.012 一带），法线在积水处拉平。SSR 的金属度入口改成光滑度乘朝上程度。
- 后期：SSR 之后做竖向拉丝和距离散射；泛光阈值约 1、强度约 0.3；AgX 混 0.45 的色相保留；再加很小的色差、颗粒、镜头污渍。
- 雨：粒子用离相机最近的约 24 盏灯上色，而不是一条灰线。
- 机器人：资产学 kestrel 的分件和 Blender 关节；脚下接触用网格落点，接触阴影只补缝。
- 先不要接：`pmndrs/postprocessing`、`realism-effects`、`MeshReflectorMaterial`、整包 Eanpa 天空、实时路径追踪。