# 任务:写一个"常驻无界面 Blender"工具(写任务)

## 背景
项目 新游戏(先读项目根目录 AGENTS.md)。我们不用 Blender MCP(它需要开着界面、手动连接,而用户 12 小时不在)。需要一个等价的工具:后台常驻一个无界面 Blender 进程,AI 可以多次发送 Python 代码进去执行,场景状态在两次调用之间保留,并能随时渲染预览图。Blender 路径:/Applications/Blender.app/Contents/MacOS/Blender(版本 5.2 LTS)。

## 要做什么
在 tools/blender/live/ 下写:
1. `server.py`:用 `Blender -b --factory-startup -P tools/blender/live/server.py -- --port 9877` 启动。只监听 127.0.0.1。接收 JSON 请求 {"code": "...python..."},在同一个 bpy 会话里 exec(共享一个持久的全局字典),返回 {"ok", "stdout", "error"(含 traceback), "result"}。单线程按顺序执行即可。
2. `blender_live.py`(命令行客户端,纯标准库):
   - `start`:后台启动 server(写 pid 文件和日志到 /tmp/blender-live/),已在运行就直接返回;
   - `exec <file.py>` 或 `exec -c "<code>"`:发送代码并打印结果,出错时退出码非 0;
   - `render <out.png> [--engine EEVEE|CYCLES] [--samples N] [--res 1280x720]`:用当前场景相机渲染预览图(没有相机就自动加一个对准场景包围盒的相机和一盏灯);
   - `export <out.glb>`:导出 glb(应用修改器);
   - `reset`:清空场景;`stop`:关闭进程;`status`。
3. `README.md`:简短说明用法和一个完整示例(建一个倒角立方体 → 渲染 → 导出)。

## 验收
- 自己实际运行:start → exec 建模 → 再 exec 修改(证明状态保留)→ render 出 png → export 出 glb → stop。把命令和输出摘要写进交回结果。
- 渲染要真的出图(文件大小 > 0)。

## 权限
写任务,只能改 tools/blender/live/ 下的文件。不需要联网。不得调用任何付费生成。
## 交回
中文,300 字以内:做了什么、验收命令与结果、已知限制。
