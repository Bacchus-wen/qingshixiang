# 任务:第三轮代码审查(只读)

先读 AGENTS.md。上一轮你的审查(docs/review-code-codex-r2.md)已处理。请审查这些新增/大改的文件:
src/story/fragment.js(门的记忆片段,闭环瞄准、孩子随刻度长高、人群淡出)、src/story/director.js(标题、抵达、闪电、推镜、景深、结尾重玩)、src/systems/street/details.js(拆字、通知、道具摆放)、src/systems/street/index.js(砌砖店面、卷帘门)、src/systems/robot/index.js(合并、投影片 line 模式、预热)、src/engine/PostFX.js(景深)。
重点:1)状态机漏洞(片段重复触发、片段进行中用户松手/切窗/电量为零、结尾后点击重玩、lookOverride/forceOpen/goboMode 残留);2)性能(每帧分配、CanvasTexture 重绘频率、透明面片数量、合并遗漏);3)WebGL2 回退风险;4)任何会导致"首次出现时卡顿"的着色器编译(新材质第一次可见)。
按"致命/重要/可优化"分级,给文件:行号、证据、改法。只读,不联网,不启动任何程序。中文 1200 字以内。
