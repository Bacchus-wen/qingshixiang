这条调研只读，我先按 X 检索流程把三条帖子、回复和作者相关帖读完，再只写他们怎么同时做到好看和流畅。使用 agent-reach 的 X 平台，同时用内置 X 搜索读原帖、回复和作者相关帖。先把三条线程和灯塔对比帖拉下来。原帖只有摘要，回复被截断了。我接着翻这三位作者自己讲流程和性能的帖。三条帖都没有帧率、机型，也没有 WebGPU、烘焙光照、贴图压缩或 LOD。观感来自模型和多轮修改。Shikhar 写明这版没优化；另外两人没给运行性能数据。

**1. Shikhar，雨夜霓虹城**  
[原帖](https://x.com/xikhar/status/2109782676085539061)。Opus 5.5。正文说一条参考就能生成整座 3D 世界。[提示词回复](https://x.com/xikhar/status/2109810373348176012)指定 Three.js；需要时用 Blender 做资产，用 codex-cli 的 imagegen 做贴图，并配几张参考图。子代理分头做，用 `/loop`，再让一个苛刻的视觉子代理对着游戏名并排盲比。他确认这是 Matt Shumer 的 gauntlet loop，自己常用来做浏览器 demo，并说这套提示没什么特别（[说明](https://x.com/xikhar/status/2109817081139236943)）。他又说这只是一次灯光和反射实验，不能玩。做到一半因为 token 用完停下，[产出未优化、满是 bug](https://x.com/xikhar/status/2109804861055496393)，不打算真用。源码：https://github.com/xikhar/cybercity 。WebGL 还是 WebGPU、烘焙、压缩、LOD、后期、帧率、设备、耗时：未提及。

**2. Bee，Kestrel-K1**  
[原帖](https://x.com/thtbee_/status/2110390964028330106)。Gemini 4 Argon，Three.js 和 Blender，大约 30 小时的迭代加人工方向。原本只做机械手，效果好就扩成可交互的全身，并让模型加入预制姿势。[回复](https://x.com/thtbee_/status/2110766393079804234)写明不是一次生成，而是多轮自我迭代。同线程他说，Argon 要有人给方向、反复改，才能接近 Opus 5.5 一轮做出的完成度。他没说自己手工建模。演示：https://thtbee.github.io/waggles/kestrel-k1/ 。WebGL 还是 WebGPU、烘焙、压缩、LOD、后期、帧率、设备：未提及。他另一条直升机帖写过 Argon 加 Nano Banana，这条没有。

**3. An Xuan，灯塔对比**  
[原帖](https://x.com/anxuanng/status/2110819776281079978)。同一份 brief 交给 Opus 5.5 和 Gemini 4 Argon，都走 Blender 再进 three.js。他写两轮批注，不手改。两边锁同一套镜头、对焦和模糊。Opus 66 分钟，Argon 111 分钟。原话是 Argon built the better path，Opus got the sea。WebGL 还是 WebGPU、烘焙、压缩、LOD、帧率、设备：未提及。同一天他在另一条帖下[回复](https://x.com/anxuanng/status/2110668126547525757)：可以直接用 Three.js 建模，但不如放进 Blender。