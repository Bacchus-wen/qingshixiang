# 新游戏 · 青石巷

一段 4 到 6 分钟的网页实时体验(three.js WebGPU)。雨夜里一条等待拆迁的老街,居民都搬走了。一台残破的测绘机器人靠墙坐着。按住,它那只还能用的机械眼会卡顿着睁开,琥珀色的光照到哪里,哪里就回到过去。

## 运行
需要 Node.js 20.19+ 或 22.12+。
```bash
npm install
npm run dev      # 打开终端里显示的地址(推荐 Chrome / Edge,支持 WebGPU;否则自动退回 WebGL2)
```
戴上耳机,点击画面开始。

## 操作
- **按住空格或鼠标左键**:让眼睛睁开(第一次总是失败)。
- **移动鼠标**:它的头会迟钝地跟着转,光束扫过的地方显出过去。
- 让光停在对面那扇门上几秒。
- 结尾字幕出现后,点击可重看。

## 调试参数(加在地址后面)
| 参数 | 作用 |
|---|---|
| `?phase=wait` / `look` | 跳过开场,直接到等待 / 注视阶段 |
| `?speed=4` | 时间加速(测试用) |
| `?power=0.2` | 电量少,快速看结尾 |
| `?q=low` | 低画质(关 SSR、景深,体积光步数减半) |
| `?stats` | 显示帧率 / CPU 面板 |
| `?webgl` | 强制 WebGL2 |
| `?dpr=1.5` | 固定内部分辨率倍数(默认 1,并会自动下调) |
| `?shot=<名字>` | 固定镜头截图模式(镜头列表见 `src/engine/shots.js`) |
| `?pfx=nossr,notraa,nodof` | 关闭单项后处理 |
| `?skip=rain,ghosts` / `?only=...` | 关闭或只开某些系统 |

## 工具
首次使用工具前:`npx playwright install chromium`(工具只用 Playwright 自带的 Chromium,不会启动你自己的 Chrome);`tools/play.mjs` 拼图和 `tools/optimize-assets.sh` 需要系统里有 `ffmpeg`;Blender 脚本需要 Blender 5.2。

- `node tools/play.mjs --speed 4`:自动试玩全程并截图(`renders/play-sheet.jpg`)。
- `node tools/shot.mjs <镜头> [--uncap] [--size 1920x1080]`:单镜头截图 + 性能数据。
- `node tools/profile.mjs <镜头>`:CPU 性能剖析。
- `node tools/audio-render.mjs`:离线渲染并检查音景。
- `tools/blender/*.py`:无界面 Blender 生成机器人、道具、人物;导出后运行 `tools/optimize-assets.sh`。

## 目录
```
src/engine/     渲染器、主循环、后处理(SSR、TRAA、景深、泛光、调色)、输入、镜头
src/materials/  湿润层、世界坐标贴图、记忆光锥遮罩
src/systems/    street(街道)、atmo(雾/体积光/闪电)、robot(机器人与眼睛)、ghosts(过去的人)、rain、audio
src/story/      director(节奏与镜头)、fragment(门的记忆)
src/ui/         片边 UI
docs/           美术方向、剧情、调研、审查记录、汇报(REPORT.md)、性能(PERF.md)
```

## 制作
由三个 AI 协作完成:Claude(Opus 5.5,统筹与主要实现)、Codex(gpt-6-astra,雨、声音、Blender 工具与道具、人物、代码审查)、Grok(调研与画面审查)。素材出处见 `CREDITS.md`。非商用。
