# 任务:程序合成音景(写任务)

## 背景
项目 新游戏:先读 AGENTS.md、docs/art-direction.md、docs/concept-ruin.md 第 6 节(声音)。全部用 Web Audio 程序合成,不用音频文件,不用付费生成。氛围是最重要的:荒凉、绝境、孤独。

## 要做什么
在 src/systems/audio/ 写 `export default { name: 'audio', init, update }`:
1. 浏览器要求用户手势后才能出声:在第一次 pointerdown/keydown 时 resume AudioContext。
2. 分层:近处雨(细密高频噪声 + 随机雨滴颗粒)、远处雨(低通的宽噪声)、屋檐滴水(稀疏、带音高变化的水滴)、风穿过破窗(带共振峰扫动的噪声,偶尔呜咽)、一盏坏灯的嗡嗡声(50/60Hz 谐波 + 接触不良时的噼啪)、远雷(偶发,低频隆隆,延迟 2-6 秒)。
3. 卷积混响:用程序生成的脉冲响应模拟湿街巷的反射(不加载文件)。
4. 读 `ctx.world.rain`、`ctx.world.lightning`(0..1,触发雷声)、`ctx.memory.strength`(0..1)。memory.strength 上升时:雨声被压低、低通,出现一层非常轻的温暖持续音(像远处模糊的人声和街市的回忆,用滤波噪声和缓慢和弦合成,不要旋律感太强)。
5. 对外接口 `ctx.api.audio = { play(name, opts) }`,先实现 'servo'(机械伺服转动,带摩擦和卡顿)、'click'(继电器)、'whine'(电容充电高频声)三个一次性音效,供之后的睁眼交互调用。
6. 总音量和每层音量做成可调参数;`?mute` 静音。

## 验收
- 写一个 tools/audio-render.mjs(允许新建)用 OfflineAudioContext 在 Node 里无法跑的话,就改为在页面里加 `?audiotest` 参数:自动渲染 10 秒离线音频并把 RMS/峰值打印到控制台。用 `node tools/shot.mjs lookdev --query "only=lookdev,audio&audiotest"` 跑通并把控制台输出写进交回结果。
- 控制台无报错。

## 权限
写任务,只能改 src/systems/audio/**、src/systems/index.js(把 audio 加进 SYSTEMS)、tools/audio-render.mjs。不需要联网。不得调用付费生成。
## 交回
中文,300 字以内。
