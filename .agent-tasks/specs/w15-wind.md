# 任务:风与环境动态(写任务,只写代码,不要启动浏览器/Vite/Blender)

先读 AGENTS.md、docs/art-direction.md。用户反馈:场景要"动态结合",现在环境本身偏静止。ctx.world.wind 是一个 Vector2(风向风速)。
新建 `src/systems/wind/index.js`(`export default { name: 'wind', init, update }`),并在 src/systems/index.js 的 SYSTEMS 里加入(放在 rain 之前,只改那一处 import 和数组):
1. 阵风:ctx.world.windGust 0..1,缓慢起伏 + 偶发强阵风(每 20 到 40 秒一次,持续 2 到 4 秒);闪电时(ctx.world.lightning)略增强。
2. 让已有物体随风动:在 init 里遍历场景,找到 `userData.prop === 'props2/laundry'`(晾衣竿上的衣服,网格名可用 Blender 名称区分)、通知纸(material.name 或 renderOrder===4 的 PlaneGeometry 平面,高约 0.59)、电线(TubeGeometry)。注意:街道的静态网格会在 street init 末尾被合并,合并后的大网格不要动;衣服、通知纸目前未合并或已标记 dynamic 的才可以动——如果需要,告诉 Claude 哪些需要在 details.js 里加 `userData.dynamic = true`,不要自己改 details.js。用顶点着色器(positionNode)或每帧小幅旋转实现摆动,幅度随阵风变化,衣服下摆摆得最大、上端固定。
3. 新增:被风吹着沿街滚动的纸屑和塑料袋(20 到 40 片,InstancedMesh,贴地翻滚、阵风时腾起一点,撞到路缘停住);屋檐滴下的水帘(几条细水流,在路灯光里才亮,参考 rain 系统的光照写法);窗玻璃上往下淌的雨痕(用屏幕/世界空间条纹调制已有窗玻璃材质的粗糙度,或独立的细条面片)。
4. 声音挂钩:阵风强度写进 ctx.world.windGust,音频系统之后可以读。不要改 audio 目录。
5. 性能:不要每帧 new 对象,不要切换灯光 visible,不要新增灯光;首帧前 30 帧可见以预编译。
验收(静态):`npx vite build` 通过。Claude 会截图验收。
权限:写任务,只能改 src/systems/wind/**、src/systems/index.js。不联网,不得调用付费生成。交回中文 250 字以内,列出需要 Claude 在 details.js 里标记 dynamic 的对象。
