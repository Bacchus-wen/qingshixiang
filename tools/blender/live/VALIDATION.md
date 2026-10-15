# 验收记录（2026-10-16）

状态：实现及协议测试已交付，**真实 Blender 端到端验收未通过**。当前执行沙箱禁止本机回环 socket；独立启动 Blender 也退出 139。未生成 PNG/GLB，未进行图片视觉验收，不将协议测试视作真实 bpy 验证。

## 已执行命令及输出摘要

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tools/blender/live -p 'test_*.py' -v
```

`Ran 7 tests ... OK`。通过持久变量/函数作用域、每次 result 独立、异常前改动保留和恢复、SystemExit 捕获、不可序列化结果、非法 JSON、浏览器请求拦截、停止标志检查。测试使用内存连接及 bpy 导入替身，不执行真实建模或渲染。

```sh
python3 tools/blender/live/blender_live.py start
python3 tools/blender/live/smoke_test.py
```

两者退出 1：`blender-live: [Errno 1] Operation not permitted`。冒烟测试在默认独立端口 19877 的 `start` 阶段停止，后续步骤没有执行。独立 `socket.bind(('127.0.0.1', 19877))` 检查也返回同一权限错误。

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python-exit-code 1 -P tools/blender/live/server.py -- --port 19877
```

输出版本 `Blender 5.2.0 LTS`，未输出服务 READY，退出 139 并报告写入 Blender 崩溃记录。另试 OpenGL 后端被当前安装明确拒绝（只支持 Metal），同样退出 139；未继续重试或绕过沙箱。

## 在允许后台 Blender 和回环 socket 的本机终端验收

```sh
python3 tools/blender/live/smoke_test.py
```

脚本顺序执行：start → status → 重复 start 核对 PID → reset → exec 文件建倒角立方体 → exec 修改并核对 counter=2 → 故意抛异常并核对恢复 → render → export → 检查非空 PNG/640×360 尺寸/GLB 格式/倒角顶点数 → reset → stop → status 确认退出。

默认 CYCLES CPU，输出为 `_output/cube-cycles.png` 和 `_output/cube.glb`（相对本目录）。可另运行 `python3 tools/blender/live/smoke_test.py --engine EEVEE` 检查 Metal/EEVEE。还需实际查看生成图片。此记录不预先宣称这些步骤成功。

仅修改本目录；未改 `docs/PROGRESS.md`，以遵守本次更窄的任务写入范围。
