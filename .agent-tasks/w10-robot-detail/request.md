# 任务:机器人细节加工(写任务,只改 Blender 脚本,不要运行 Blender)

先读 AGENTS.md、docs/art-direction.md、docs/review-visual-grok-r2.md 第 7 条。机器人由 tools/blender/robot.py 程序化生成(Claude 写的),现在偏"积木感"。请在**不改变姿势、位置、整体比例**的前提下加细节:
1. 外壳:面板分缝(浅槽)、螺栓/铆钉、几处凹痕和缺口(用现有 cut() 或新函数),肩部装甲(右肩)、膝盖护板、背后电池包带散热格栅。
2. 机械:四肢加液压管/活塞和走线;右手手指分节(3 节),缺一根小指;脖子露出线束。
3. 头部:镜筒眼加刻度环纹理感的细环(几何细分即可)、遮光罩;面板加两三道刮痕槽。
4. 必须保持这些名字和层级不变(three.js 依赖):empty `robot`、`torso`、`head`、`eye`、`iris_0`..`iris_7`(各带子物体 `iris_blade_k`),网格 `eye_core`、`eye_lens`、`chest_light`;材质名 shell_ceramic、shell_dark、frame_metal、joint_metal、iris_blade、lens_glass、rubber、cable、eye_core、eye_dead、chest_core。可以新增材质但只能是灰度 Principled 数值。
5. 三角面总数 < 70k,glb < 1.5MB。脚本结尾保留 `os._exit(0)`。
验收(静态):`python3 -m py_compile tools/blender/robot.py`。不要运行 Blender(沙箱会让它崩溃弹窗),Claude 会运行并截图反馈。
权限:写任务,只能改 tools/blender/robot.py。不联网,不得调用付费生成。交回中文 200 字以内。
