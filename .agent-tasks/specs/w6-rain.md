# 任务:雨只在光里亮(写任务,只写代码,不要启动浏览器/Vite/Blender)

先读 AGENTS.md、docs/review-visual-grok-r2.md(第 3、5 条)。你写的雨系统在 src/systems/rain/。
改进:
1. 雨的亮度来自光照:只有被路灯或眼睛光锥照到的雨滴才亮,阴影里的雨几乎不可见(保留极弱的环境可见度 ~5%)。路灯位置和方向可从 ctx.api.street.lamp / ctx.api.street.far(three.js SpotLight,有 position、target.position、angle、penumbra、distance、intensity)读取,作为 uniform 每帧同步;用聚光灯的圆锥衰减和距离衰减算亮度。眼睛光锥沿用 memoryMask / ctx.memory(琥珀色)。闪电时(ctx.world.lightning 0..1)全场雨短暂可见。
2. 三档粗细与速度(近处更粗更快更虚、远处更细),近景(离相机 < 2.5m)雨丝变宽变淡模拟失焦,不要出现近处粗白线。
3. 地面溅水环不要等距排列(Grok 看到"井盖圆环等距"),随机化位置、大小、寿命。
4. 性能不变或更好。
验收(静态):`npx vite build` 通过,不启动任何程序;交回中写清改了哪些 uniform 和公式。
权限:写任务,只能改 src/systems/rain/**。不联网,不得调用付费生成。交回中文 250 字以内。
