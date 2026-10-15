# 程序音景

2026-10-16：实现已写入，Node 控制与生命周期检查、生产构建通过；浏览器音频与截图验收受沙箱限制，尚未完成。

## 设计与实现

- 实时与离线渲染共用 `graph.js`：近雨、远雨、屋檐滴水、共振破窗风、坏灯谐波与噼啪、闪电后 2–6 秒远雷。
- 程序生成双声道噪声及 2.8 秒巷道脉冲响应；高通、动态压缩、总音量位于最终输出。没有音频文件、联网或付费生成。
- `ctx.world.rain` 调整全部雨层，`ctx.memory.strength` 压低并低通雨声、淡入滤波人声质感噪声和缓慢变化的持续和弦。只合成模糊质感，没有真实语言或录音。
- 闪电用上升阈值触发，低阈值重置，7 秒内多次闪烁合并；不会因持续非零而连续打雷。
- 首个 pointerdown/keydown 创建并 resume AudioContext；始终用 AudioContext 时间调度。恢复后台页面不补发错过的雨滴。瞬态释放连接，实时并发上限 48。
- 保留手势监听用于移动端中断恢复；`dispose()` 移除监听、停止声源、断开节点并关闭上下文。

实施顺序：先验证控制/雷声调度，再写共享音频图与系统适配器，最后执行真实离线渲染和截图验收。当前最后一步被环境阻止。

## 接入

```js
ctx.api.audio.play('servo', { duration: 1.2, gain: 0.7, pan: -0.2 });
ctx.api.audio.play('click');
ctx.api.audio.play('whine', { duration: 1.5 });
ctx.api.audio.levels.master = 0.5;
ctx.api.audio.levels.wind = 0.25;
ctx.api.audio.setMuted(true);
```

`levels` 的参数均为 0..1：master、nearRain、farRain、drips、wind、lamp、thunder、memory、servo、click、whine、reverb。
URL 示例：`?only=lookdev,audio&volume=0.5&audio.wind=0.25`，`?mute`，`?skip=audio`。
手势前 `play()` 返回 false，不积压音效；未知音效也返回 false。`state` 为 locked/running/suspended/interrupted/closed/unavailable。

## 验收与交接

```sh
node src/systems/audio/verify.mjs
npm run build
node tools/audio-render.mjs
node tools/shot.mjs lookdev --query "only=lookdev,audio&audiotest"
```

前两项已通过。实际 Node 输出：

```text
PASS audio control: rain/memory, finite inputs, thunder delay/debounce, seeded RNG, RMS
PASS audio lifecycle: gesture gate, retry, URL levels, locked effects, idempotent disposal
```

`tools/audio-render.mjs` 用已安装的 Playwright/esbuild 在空白浏览器页面运行原生 OfflineAudioContext，无须服务器。此副本内 Chrome 启动后 SIGABRT；截图脚本报 `listen EPERM: operation not permitted ::1:5173`。因此没有真实 RMS/峰值、截图、控制台无错误或听感通过的结论。

`?audiotest` 会等待 10 秒双声道离线音频渲染完成并打印 `[audio-test] 10s RMS=… peak=…`；另验证完全静音、记忆压低雨声和十个独立音层，结果存于 `ctx.api.audio.test`。它不会自动播放音频。离线渲染的采样率为 24 kHz，实时沿用设备采样率。

现有 `tools/shot.mjs` 只转发 console warning/error，不转发普通 log；因此数值从浏览器控制台或 `node tools/audio-render.mjs` 读取，截图脚本仍会捕捉测试失败的 error。未越权修改该工具。

集成方需要在允许启动浏览器的环境重跑最后两条命令，试听长时间混音及睁眼交互，再将验收结果记入 `docs/PROGRESS.md`；本次授权范围不包括该文件。
