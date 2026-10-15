# 常驻无界面 Blender

Python 3 标准库客户端；Blender 5.2 LTS 在后台主线程顺序执行代码，场景和 Python 全局变量跨请求保留。无需 MCP、界面连接、联网或付费服务。

从项目根目录运行：

```sh
python3 tools/blender/live/blender_live.py start
python3 tools/blender/live/blender_live.py status
python3 tools/blender/live/blender_live.py exec model.py
python3 tools/blender/live/blender_live.py exec -c 'result = len(bpy.data.objects)'
python3 tools/blender/live/blender_live.py render preview.png --engine EEVEE --samples 32 --res 1280x720
python3 tools/blender/live/blender_live.py export model.glb
python3 tools/blender/live/blender_live.py reset
python3 tools/blender/live/blender_live.py stop
```

默认端口 `9877`，仅绑定 `127.0.0.1`。全局选项放在子命令之前：`--port 19877`、`--timeout 600`、`--blender <可执行文件>`；也可用 `BLENDER_BIN` 指定 Blender。默认可执行文件为 `/Applications/Blender.app/Contents/MacOS/Blender`。

PID、追加日志、启动锁分别为 `/tmp/blender-live/<端口>.pid`、`.log`、`.lock`。重复 `start` 返回同一个进程；端口属于另一份项目时拒绝操作，请选新端口。`stop` 等待进程退出，成功后删除 PID 文件；日志保留。可直接启动服务：

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P tools/blender/live/server.py -- --port 9877
```

## 完整示例：倒角立方体 → 跨调用修改 → 渲染 → 导出

```sh
python3 tools/blender/live/blender_live.py start
python3 tools/blender/live/blender_live.py reset
python3 tools/blender/live/blender_live.py exec -c '
bpy.ops.mesh.primitive_cube_add()
cube = bpy.context.object
cube.name = "BeveledCube"
bevel = cube.modifiers.new("Bevel", "BEVEL")
bevel.width = 0.16
bevel.segments = 4
counter = 1
print("created", cube.name)
result = {"counter": counter, "objects": len(bpy.data.objects)}
'
python3 tools/blender/live/blender_live.py exec -c '
assert cube == bpy.data.objects["BeveledCube"]
cube.scale.z = 1.4
counter += 1
result = {"counter": counter, "scale_z": cube.scale.z}
'
python3 tools/blender/live/blender_live.py render tools/blender/live/_output/cube.png --engine CYCLES --samples 16 --res 1280x720
python3 tools/blender/live/blender_live.py export tools/blender/live/_output/cube.glb
python3 tools/blender/live/blender_live.py stop
```

没有场景相机时，`render` 根据求值后的几何包围盒添加相机和区域灯；已有场景相机则使用它及现有灯光。输出路径相对于客户端当前目录解析，自动建父目录。预览相机、灯光、渲染参数会保留。CYCLES 使用 CPU；EEVEE 需要系统可用的图形后端。`export` 导出整个场景，以应用修改器后的网格生成 GLB，不破坏原场景修改器。

## 协议与边界

HTTP `POST /`，UTF-8 JSON 请求 `{"code":"print('hello'); result = 42"}`；响应始终含 `ok`、`stdout`、`error`、`result`，失败时 `error` 包含 traceback，CLI 返回非零退出码。`result` 由代码显式赋值，须可 JSON 序列化；未赋值为 `null`，上一次的 `result` 不沿用。普通 Python stdout/stderr 被收集；Blender 原生渲染日志在 `.log` 中。请求体最多 8 MiB。

同一进程内无事务回滚，失败代码之前的改动也保留。`reset` 清空场景、数据和用户全局变量；`stop` 丢弃内存状态。代码里的相对路径相对于服务启动目录。所有操作（包括 status/stop）排队；长任务可提高 `--timeout`，客户端超时或断开不会取消已提交的任务，勿盲目重试。无限循环或原生崩溃需要人工处理对应 PID。

只接收可信本机代码：这是具备 Blender 进程文件访问能力的 `exec` 服务，没有认证或代码沙箱，不应转发端口。浏览器 Origin 请求被拒绝。

## 验证

```sh
# 不启动 Blender 的协议/异常/状态保留测试
python3 -m unittest discover -s tools/blender/live -p 'test_*.py' -v
# 真正启动 Blender、两次 exec、PNG、GLB、异常恢复和 stop；独立端口
python3 tools/blender/live/smoke_test.py
# 如需另测 EEVEE
python3 tools/blender/live/smoke_test.py --engine EEVEE
```

实际冒烟测试保留图片和 GLB 在 `_output/`，检查 PNG 尺寸、GLB 格式及倒角后顶点数量。交付环境的实测结果见 `VALIDATION.md`。
