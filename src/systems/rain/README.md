# Rain

实现已写入；**尚未通过浏览器画面验收**。

- `?only=lookdev,rain`：与 lookdev 联看；`?only=rain`：独立隔离。
- WebGPU：默认 60,000 / `q=low` 20,000 雨滴，一个 compute dispatch，五个单面次透明绘制对象。
- WebGL2：自动改用 CPU 更新的 6,000 / 2,400 雨滴，不创建 storage 或 compute 节点。
- 风为世界 X/Z 方向米/秒，速度 10–16 米/秒；使用引擎 dt/t、固定种子。
- w28：移除固定 0.05 环境底亮。雨丝、雨幕和涟漪的透明度乘入射光亮度的 `smoothstep(0, 0.12, luminance)`；无路灯、有效招牌、记忆光束或闪电时为零。亮度门控在光束 ×3 之前计算，颜色仍保留 HDR 提亮；不增加灯或绘制批次。
- 雨量控制整体透明度；光锥使用 `src/materials/memory.js` 的共享 `memoryMask`，由机器人同步。
- 雨丝与远景雨幕接收附近霓虹，贡献权重 0.4；6 米内按平方距离平滑衰减，范围外贡献为零。CPU 按模拟时间每 0.5 秒选镜头最近的 8 块招牌，使用两个 `vec4[8]` uniform 数组。
- 现在只有 `alive` 招牌染雨，供电读取共享 `mains`；记忆中的染色要求招牌与接收雨滴同时进入记忆。招牌端每帧用 `memoryMaskCPU`（无边缘噪声），雨滴端用完整 TSL mask。`neon=past` 强制所有入选招牌发光。
- 光束内雨丝/雨幕乘 `1 + 2 * memoryMask`，满强度为 ×3，保留 HDR；地面涟漪不额外放大。不创建灯光，绘制对象仍为 5 个。
- `raincolor=0` 关闭本次霓虹染色和 ×3 提亮，便于同机位对照；其余照明保持。未传入霓虹 API 时，染色贡献为零。
- 地面为 y=0；GPU 用 3,072 / 1,024 个雨滴的实际撞地事件生成 0.48 秒涟漪，CPU 为 768 / 256 个。不是场景网格碰撞或水量模拟。
- 固定世界范围 X ±13、Y 0–16、Z -48–16；远景三层雨幕位于 Z -20/-31/-42。后续镜头超出该范围需扩展。
- `ctx.api.rain` 提供模式、粒子数、涟漪池大小和边界。全部材质透明、不写深度。

## 已执行

`npm run build` 通过。

`node src/systems/rain/verify.mjs` 通过：CPU 落地/风向/生命周期、最近 8 块筛选、0.5 秒刷新、时间回退、线性 RGB、记忆源门控、past/off 模式、空槽清理及四档配置检查；Three r186 自身构建器生成 WGSL compute、WGSL/GLSL 材质（包括引擎的 color/velocity MRT），生成阶段无警告或错误。检查确认新材质绑定共享 mains 与 uniform 数组。此检查不创建 GPU 设备，不代表驱动编译或 GPU 执行通过。

## 待集成方验收

w25 按项目限制未启动浏览器、Vite 服务或 Blender。以下命令由 Claude 在沙箱外执行；尚未验证雨丝可见度、霓虹颜色、光束亮度和实际帧率。

```sh
node tools/shot.mjs street-eye --query "neon=past" --tag w25-past
node tools/shot.mjs street-eye --query "neon=past&raincolor=0" --tag w25-past-control
node tools/shot.mjs flood --tag w25-flood
node tools/shot.mjs flood --query "raincolor=0" --tag w25-flood-control
node tools/shot.mjs street-eye --tag w25-now
node tools/shot.mjs street-eye --query "neon=off" --tag w25-off
```

截图在 `renders/<shot>-<tag>.png`。检查粉/青招牌附近雨丝的色差、暗区维持暗、flood 中的明亮雨丝及光束边缘；对照相同帧数，不要根据最终 tone mapping 后的像素比例断言精确 ×3。`q=low` 切换低画质粒子数。

## w28 静态复核

`node src/systems/rain/verify.mjs` 通过，新增断言确认 WGSL/GLSL 中雨丝与涟漪透明度读取入射光门控。全项目入口通过 esbuild 内存打包；未运行 Vite、浏览器、GPU 或 Blender。屋檐阻挡本次未实现。详细交接见 `.agent-tasks/w28-life-rain/result.md`。
