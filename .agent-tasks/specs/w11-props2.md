# 任务:道具包二——"人曾经在这里"的痕迹(写任务,只写 Blender 脚本,不要运行 Blender)

先读 AGENTS.md、docs/art-direction.md、docs/story-options-codex.md 方案二(迁城)。参考你写过的 tools/blender/props.py 的写法和约定(灰度材质、命名、原点在底部、os._exit(0))。
写 `tools/blender/props2.py`,导出到 assets/models/props2/,每个文件 < 300KB,合计 < 2MB:
1. `laundry.glb`:二楼窗外的晾衣竿,挂着两三件湿透下垂的衣服(布料用简单的下垂网格)。
2. `bicycle.glb`:倒在地上的旧自行车(后轮变形)。
3. `planters.glb`:门口一排枯死的盆栽(瓦盆、干枝),其中一盆摔碎。
4. `shoe.glb`:一只小孩的鞋(放在废车旁)。
5. `chair_stool.glb`:门口的塑料凳和折叠椅各一。
6. `notice_board.glb`:贴满纸的公告栏(纸张作为单独网格 `paper_*`,方便在 three.js 里贴字)。
7. `boxes_moving.glb`:捆好的搬家纸箱和蛇皮袋,堆在门口。
8. `mailbox.glb`:墙上的旧信箱,塞满信件。
另写 `tools/blender/render_props2.py` 生成检查图 renders/props2_sheet.png(参照 render_props.py)。
验收(静态):py_compile 通过。Claude 会运行并反馈。
权限:写任务,只能改 tools/blender/props2.py、tools/blender/render_props2.py。不联网,不得调用付费生成。交回中文 200 字以内。
