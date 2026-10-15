# Rain

实现已写入；**尚未通过浏览器画面验收**。

- `?only=lookdev,rain`：与 lookdev 联看；`?only=rain`：独立隔离。
- WebGPU：默认 60,000 / `q=low` 20,000 雨滴，一个 compute dispatch，五个单面次透明绘制对象。
- WebGL2：自动改用 CPU 更新的 6,000 / 2,400 雨滴，不创建 storage 或 compute 节点。
- 风为世界 X/Z 方向米/秒，速度 10–16 米/秒；使用引擎 dt/t、固定种子。
- 雨量控制整体透明度；光锥 uniform 每帧读取 `ctx.memory`，琥珀亮度乘 strength。
- 地面为 y=0；GPU 用 3,072 / 1,024 个雨滴的实际撞地事件生成 0.48 秒涟漪，CPU 为 768 / 256 个。不是场景网格碰撞或水量模拟。
- 固定世界范围 X ±13、Y 0–16、Z -48–16；远景三层雨幕位于 Z -20/-31/-42。后续镜头超出该范围需扩展。
- `ctx.api.rain` 提供模式、粒子数、涟漪池大小和边界。全部材质透明、不写深度。

## 已执行

`npm run build` 通过。

`node src/systems/rain/verify.mjs` 通过：CPU 落地/风向/生命周期及四档配置检查；Three r186 自身构建器生成 WGSL compute、WGSL/GLSL 材质（包括引擎的 color/velocity MRT），生成阶段无警告或错误。此检查不创建 GPU 设备，不代表驱动编译或 GPU 执行通过。

## 待集成方验收

已运行要求的命令，但本副本沙箱拒绝本地端口监听（`listen EPERM ::1:5173`），Chrome 也无法在该沙箱启动。因此没有产生截图，未验证浏览器控制台、雨丝可见度、光锥染色和实际帧率。

```sh
node tools/shot.mjs lookdev-low --query "only=lookdev,rain"
node tools/shot.mjs lookdev-low --query "only=lookdev,rain&q=low"
```

预期截图路径为 `renders/lookdev-low.png`（两次命令会覆盖同名截图）。`lookdev-low` 是镜头名称；只有 `q=low` 才切换低画质粒子数。
