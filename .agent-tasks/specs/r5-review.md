# 任务:第四轮代码审查(只读)

先读 AGENTS.md、docs/review-code-codex-r4.md(上轮意见已处理)。审查新增/改动:
src/story/micro.js(两段小记忆:照相馆闪光、面馆蒸汽)、src/story/fragment.js(门槛 lookTime>35、人群回归、刻度错列)、src/story/director.js(目光回门、提示、重玩)、src/systems/robot/index.js(aimAt 闭环、光圈叶片前移、核心前移、梦里闪烁、openCap)、src/systems/street/index.js(路灯与售货机闪烁、路面标线、窗框)、src/engine/Engine.js(自适应分辨率、gputime、方向键)、src/systems/cat/index.js(你写的,Claude 改了位置)。
重点:状态残留(aimAt/lookOverride/goboMode/openCap 的设置与清理是否对称)、首次出现卡顿的着色器(新 SpotLight/PointLight 是否从一开始就在场景里、强度为 0 而非切换可见)、自适应分辨率是否会抖动或在截图模式误触发、闪烁随机数是否破坏确定性截图、性能。
按"致命/重要/可优化"分级,给文件:行号、证据、改法。只读,不联网,不启动程序。中文 1000 字以内。
