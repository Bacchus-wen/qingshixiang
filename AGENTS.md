# 新游戏 — AI 团队共同规则(Claude / Codex / Grok 都必须先读)

## 项目是什么
- 3 到 8 分钟的网页短体验,非商用。
- 荒凉的雨夜废城 + 一台残破的机器人。核心交互:玩家长按,机器人残破的机械眼缓缓睁开,光锥照到的地方显出这座城的过去。
- 详细概念见 `docs/concept-ruin.md`,剧情见 `docs/story.md`,美术方向见 `docs/art-direction.md`(后两份由团队商定后写入)。

## 用户的授权与状态
- 用户不在线。剧情、风格、技术方案都由 AI 团队商量决定,不要停下来等用户。
- 拿不准的设计分歧:按 team-sync 的互评流程最多 2 轮,仍有分歧由 Claude 裁决并写进 `docs/DECISIONS.md`。
- 可以在本地 `git commit` 做存档点。**只在用户明确要求时 push**,而且只推到私有仓库 `Bacchus-wen/qingshixiang`(2026-10-20 用户第一次要求);不要自己建远程仓库、不要改仓库可见性或设置。网页版怎么构建见 `docs/DEPLOY.md`,发布由用户决定。

## 硬性禁止
- 2026-10-16 15:20 用户改为允许:公司素材中台(vmc,生图/贴图)和 Tripo(生 3D 模型)可以用;每次生成都要有明确用途,不要批量乱生成。ChatGPT 的任何功能仍然禁止。
- 用户授权:本项目是公司内部展示,可以使用 reference/ 下别人的作品素材(cybercity、kestrel-k1 等),但每个素材来源都要记进 CREDITS.md。
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

## 分工与信息安全(用户 2026-10-16 03:15 补充)
- 主力是 Claude(Opus 5.5)和 Codex(gpt-6-astra):核心设计、编码、互相审查。Grok 负责调研、批量检查、第二意见。
- **2026-10-19 起 Grok 订阅已过期,不要再给 Grok 派任务**(`team post --to others` 会派到 Grok,改用 `--to codex`);需要第二个视角时给 Codex 派两份分工不同的任务。
- Codex 只通过本机 team-sync 调用。**不要使用 ChatGPT 的任何功能**:ChatGPT 网页/App、Codex Cloud 云端任务、ChatGPT 连接器与同步、OpenAI 图像生成。防止项目信息同步或泄露。
- 氛围是最重要的,故事可以薄;方向自由,不限雨夜废城。主动搜索并使用一切合适的免费技术和开源工具;共享工具放 `~/Tools`(见 `~/Tools/README.md`)。
- 技术现成能力清单见 `docs/tech-inventory.md`,参考实现见 `~/Tools/refs/three-r186-examples/`。

## 进程安全(2026-10-16 03:20,用户反馈 Chrome 和 Blender 弹出崩溃)
- **绝不启动用户自己的 Google Chrome**(Playwright 不要用 `channel: 'chrome'`)。截图一律用 `tools/shot.mjs`,它用 Playwright 自带的 Chromium(`channel: 'chromium'`)。
- **Blender 只用无界面模式**(`-b`),脚本结束时用 `os._exit(0)` 直接退出,避免退出清理阶段的段错误(会弹系统崩溃对话框)。不要用 kill -9 杀 Blender,先发正常退出请求。
- 任何你启动的后台进程(Vite、浏览器、Blender)在任务结束前必须关掉;结束前用 `pgrep -fl "Blender|Chromium|vite"` 自查。
- **Codex / Grok 在沙箱里不要启动 Blender、浏览器、Vite 或任何监听端口的服务**:沙箱会拦截,并让程序崩溃弹窗。写完代码只做静态检查(构建、语法、单元逻辑),画面与 Blender 的实际验收由 Claude 在沙箱外完成。
- Blender 导出 glb 后运行 `tools/optimize-assets.sh`(去重 + 焊接 + JPEG 重编码)。**不要做顶点量化**(quantize):我们的加载代码会在 CPU 上变换几何体,Int16 坐标会出错。
- 给 Codex 的参考文件放在 `docs/` 或 `tools/` 下;`.agent-tasks/` 不会出现在它的副本里。
