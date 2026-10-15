# 技术清单(已在本地 three 0.186.1 中核实存在)

路径前缀:`three/addons/`(= `node_modules/three/examples/jsm/`)。

## 光与氛围
- `lighting/vxgi/VXGINode` 体素全局光照:间接漫反射 + AO,让少量光源也能"灌满"空间。废墟里个位数光源时尤其关键。
- `lighting/LightProbeGrid` 光照探针网格:便宜的间接光,低档画质替代 VXGI。
- `lighting/ClusteredLighting` / `DynamicLighting`:大量点光源(记忆里亮起的整条街)。
- `VolumeNodeMaterial`(核心)+ `tsl/utils/Raymarching`:体积雾、光柱、眼睛的光锥。
- `tsl/display/GodraysNode`:屏幕空间丁达尔光。
- `tsl/utils/SoftParticles`:雨雾粒子与几何体相交处不出硬边。
- `objects/SkyMesh` 大气散射天空;`GroundedSkybox` 贴地 HDRI。

## 后处理
- SSR、SSGI、GTAO、SSAO、SSS(屏幕空间次表面)、TRAA、TAAU(时间超分)、SMAA、FXAA、FSR1。
- DepthOfField(睁眼对焦)、MotionBlur、Lensflare、ChromaticAberration、Film(颗粒)、Lut3D(调色 LUT)、Denoise / RecurrentDenoise。
- `OITPassNode` 顺序无关透明:雨、雾、全息体、光束交叠时的排序问题(Codex 风险审查第 5 条)的正解候选。
- `TransitionNode`:两个画面之间的过渡(现在 ↔ 过去)。
- `TileShadowNode`:大场景分块阴影。

## 物体
- `objects/GaussianSplat`:高斯泼溅渲染(若能获得免费的 splat 场景,可做"记忆"的质感)。
- `objects/WaterMesh` / `Reflector`:积水与水面。
- `objects/MarchingCubes`:可变形的体块(雾团、液体)。

## 外部工具(~/Tools)
gltf-transform、toktx、cc0-fetch(Poly Haven / ambientCG)、Blender 5.2 无界面、Playwright、ffmpeg。
