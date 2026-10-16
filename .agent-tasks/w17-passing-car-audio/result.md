已实现，仅改动 `src/systems/audio/**`：

- 湿胎嘶声＋低沉发动机，随位置调整声像和距离衰减。
- 记忆中保留车声并低通；`k=0` 后 30ms 内静音。
- 声源复用，不重复触发；支持 `audio.passingCar=0` 对照。

`verify.mjs`、语法检查及静态打包均通过。未启动浏览器、Vite 或 Blender；实际听感待 Claude 用 `?passcar` 验收，说明已写入音频 README。