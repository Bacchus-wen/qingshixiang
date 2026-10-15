# 任务:声音按画面意见修改(写任务,只写代码,不要启动浏览器/Vite/Blender)

先读 AGENTS.md、docs/review-visual-grok-r2.md 第 8 条。你写的音景在 src/systems/audio/。
改进:
1. 现在时几乎没有乐音:去掉或大幅压低任何带音高的持续层;保留雨(近处只打在一种材料上的清晰雨点 + 远处宽噪)、路灯接触不良的电流声(与 ctx.api.street.lamp.intensity 的跳变同步:强度突降时有噼啪)、远处滴水(间隔拉长、不规则)。
2. 睁眼的声音顺序:先一声像相机快门的机械"咔"(play('shutter'),新增),再是伺服和充电声;记忆层(暖色底噪,像远处人声和街市)用 2 到 3 秒淡入,跟随 ctx.memory.strength。
3. 光锥离开(memory.strength 快速下降)时,记忆层**立即**切断(50ms 内),不要淡出——"屋子的底噪立刻断掉"。
4. 闪电后的雷声延迟按 2 到 6 秒随机,低频要沉。
5. 用 tools/audio-render.mjs 的离线测试逻辑补充断言(只写代码,Claude 会运行)。
权限:写任务,只能改 src/systems/audio/**、tools/audio-render.mjs。不联网,不得调用付费生成。交回中文 250 字以内。
