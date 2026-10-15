已在授权范围实现六层音景、程序混响、记忆混音、手势解锁、三个机械音效、音量参数及 `?mute`，并注册 audio 系统。

控制逻辑与生命周期测试、生产构建通过。已提供 `?audiotest` 和 `tools/audio-render.mjs`。

浏览器验收受阻：截图命令输出 `listen EPERM ::1:5173`；独立渲染的 Chrome 启动后 SIGABRT。因此尚无真实 RMS/峰值、截图或控制台无错误结论。

交接与复验步骤见 `src/systems/audio/README.md`。