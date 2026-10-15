# 新游戏 — AI 团队共同规则(Claude / Codex / Grok 都必须先读)

## 项目是什么
- 3 到 8 分钟的网页短体验,非商用。
- 荒凉的雨夜废城 + 一台残破的机器人。核心交互:玩家长按,机器人残破的机械眼缓缓睁开,光锥照到的地方显出这座城的过去。
- 详细概念见 `docs/concept-ruin.md`,剧情见 `docs/story.md`,美术方向见 `docs/art-direction.md`(后两份由团队商定后写入)。

## 用户的授权与状态
- 用户不在线。剧情、风格、技术方案都由 AI 团队商量决定,不要停下来等用户。
- 拿不准的设计分歧:按 team-sync 的互评流程最多 2 轮,仍有分歧由 Claude 裁决并写进 `docs/DECISIONS.md`。
- 可以在本地 `git commit` 做存档点,**不要 push**,不要建远程仓库。

## 硬性禁止
- 不用 Tripo,不调用任何付费生成(生图、生模型、生视频、生音乐、TTS)。
- 不把参考 A(xikhar/cybercity,无许可)的代码或素材复制进本项目,只学思路。
- 参考 B(thtbee/waggles,CC BY-NC 4.0)原则上只学思路;如确需改编,必须在 `CREDITS.md` 署名。
- 风格必须和参考不同:不要满屏霓虹赛博、不要体素风(Cloudpunk / Nivalis Nights)、不要白色影棚展示风(Kestrel)。

## 技术栈
- three.js 0.186.1,`WebGPURenderer` + TSL,不支持时自动退回 WebGL2。Vite,原生 ES 模块,不用 React。
- 动画可用 GSAP。声音用 Web Audio 程序合成,不用音频文件(除非是自己合成导出的)。
- 模型:简单几何在代码里程序化生成;复杂的用**无界面 Blender 脚本**生成并导出 glb:
  `/Applications/Blender.app/Contents/MacOS/Blender -b -P tools/blender/<脚本>.py -- <参数>`
  脚本必须可重复运行、结果确定,输出到 `assets/models/`。不依赖手工保存的 .blend 文件。
- 首屏资源 ≤ 15MB;中档笔记本 60 帧为目标。

## 目录与归属
```
src/engine/        渲染器、主循环、后处理、输入、画质          (Claude)
src/systems/<名>/  每个系统一个文件夹,互不直接修改
src/ui/            叠加在画布上的极简 UI
src/story/         剧情时序、记忆片段数据
tools/blender/     Blender 生成脚本
tools/shot.mjs     自动截图验收
assets/models/     导出的 glb
docs/              概念、剧情、美术方向、决策、进度
reference/         参考视频(不进 git)
```
- 系统接口:`export default { name, async init(ctx), update(dt, t, ctx), dispose?() }`。
- 系统之间只通过 `ctx`(共享状态、事件总线 `ctx.events`、对外接口 `ctx.api.<系统名>`)交流。
- 改别人负责的文件前,先用 team-sync `claim`;冲突就换活。

## 验收方式
- 每个系统都要能用 URL 参数单独开关和调试,例如 `?only=rain`、`?shot=eye-open`。
- `?shot=<名字>` 是确定性截图模式(固定时间步长、固定镜头),供 `tools/shot.mjs` 自动截图。
- 做完一个功能,必须截图看过画面再说"完成",并在 `docs/PROGRESS.md` 记一行。

## 协作
- 任务板:`team board --project "$HOME/Games/新游戏"`,详见 team-sync 的 SKILL.md。
- 值得别人知道的决定用 `team note` 记下,同时写进 `docs/DECISIONS.md`。
