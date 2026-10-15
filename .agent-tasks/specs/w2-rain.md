# 任务:GPU 雨系统(写任务)

## 背景
项目 新游戏:先读 AGENTS.md、docs/art-direction.md(银盐的现在,一色的记忆)。three.js 0.186.1 WebGPURenderer + TSL。系统接口见 AGENTS.md;参考现成系统 src/systems/lookdev/index.js 的写法。
参考实现(MIT,可借鉴代码):~/Tools/refs/three-r186-examples/webgpu_compute_particles_rain.html。

## 要做什么
在 src/systems/rain/ 写一个雨系统 `export default { name: 'rain', init, update }`:
1. 近景雨丝:GPU compute 粒子(WebGPU),拉长的细线条(按速度方向拉伸),数量随画质:?q=low 2万、默认 6 万。WebGL2 回退时用较少的 CPU/顶点着色器动画方案,不能崩。
2. 远景雨幕:几层滚动的半透明面片或屏幕空间条纹,给远处加层次。
3. 地面溅水:雨滴落地处小水花(compute 里检测落到 y≈0 或简单高度,生成短命的小环/飞溅)。
4. 读 `ctx.world.rain`(0..1 强度)和 `ctx.world.wind`(Vector2)。
5. **与记忆光锥互动**:读 `ctx.memory`(origin: Vector3, dir: Vector3 单位向量, angle: 半角弧度, range, strength 0..1)。光锥内的雨滴被照亮并染成琥珀色 `#c9854a`(亮度 × strength),光锥外雨滴是中性的冷灰白、很暗。用 uniform 每帧同步。
6. 雨是透明物体,不要写深度。
7. 在 src/engine/shots.js 不要改;在你的系统里支持 `?only=rain,lookdev` 这样和 lookdev 一起看。

## 验收
- 运行 `node tools/shot.mjs lookdev-low --query "only=lookdev,rain"` 并在 src/systems/index.js 里把 rain 加进 SYSTEMS(这一处允许你改)。截图里要看得到雨丝,且眼睛光锥(lookdev 里的琥珀聚光灯方向)内的雨滴发亮。要先在 lookdev 里设置 ctx.memory 让它对准 eye 的方向,这一处也允许你改 src/systems/lookdev/index.js 里与 ctx.memory 赋值相关的几行。
- 控制台无报错。

## 权限
写任务,只能改 src/systems/rain/**、src/systems/index.js、src/systems/lookdev/index.js(仅限设置 ctx.memory)。不需要联网。不得调用付费生成。
## 交回
中文,300 字以内:做了什么、截图路径、性能(粒子数)、已知问题。
