# 任务:真正的人形剪影替换"细棍人"(写任务,只写代码,不要运行 Blender/浏览器)

先读 AGENTS.md、docs/review-visual-grok-r2.md 第 4 条和"出戏 1"。你写的 src/systems/ghosts/ 现在是圆柱拼的细棍人,看起来像占位。
1. 写 tools/blender/people.py(Blender 5.2 无界面脚本,结尾 sys.stdout.flush(); os._exit(0)):程序化建模 8 个低多边形但轮廓真实的人(每个 < 3k 三角面,有肩、胸背厚度、外套下摆、头发或帽子的轮廓):撑伞走路的上班族、提袋子的女人、背书包的孩子、拄拐的老人、推自行车的人、抱着孩子的大人、站着打电话的人、扛着纸箱搬家的人。每个导出为同一个 glb(assets/models/people.glb)里的独立对象,命名 person_0..7,原点在脚底,朝 +Y(Blender -Y)为前。腿和手臂作为子对象(leg_l、leg_r、arm_l、arm_r),便于简单摆动。
2. 改 src/systems/ghosts/:用 people.glb 的这些人(按部件 InstancedMesh 或每类型一个 InstancedMesh),保留你现在的路线、等待、牵手、光锥 CPU 剔除和不透明抖动裁切;保留 Claude 改的"暗剪影 + 琥珀轮廓光"和"离相机 3.5–6.5m 内淡出"。走路时腿臂按部件小幅摆动。
3. 失败时(glb 不存在)退回现有程序化人形,不能崩。
验收(静态):`python3 -m py_compile tools/blender/people.py`、`npx vite build` 通过。Claude 会运行 Blender 并截图反馈。
权限:写任务,只能改 tools/blender/people.py、src/systems/ghosts/**。不联网,不得调用付费生成。交回中文 300 字以内。
