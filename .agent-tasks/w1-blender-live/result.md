已在 `tools/blender/live/` 实现服务端、完整 CLI、使用示例及验收脚本。7 项协议测试通过。

验收命令：
`python3 tools/blender/live/smoke_test.py`

覆盖 start → 两次 exec → render → export → stop。但本次停在 start：沙箱禁止回环 socket；直接启动 Blender 也退出 139。**未生成 PNG/GLB，真实端到端验收未通过。**

工具仅执行可信本机代码，长任务会阻塞后续请求。详细命令与结果见 [VALIDATION.md](tools/blender/live/VALIDATION.md)。