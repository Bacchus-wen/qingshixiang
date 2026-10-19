# 新游戏 · 青石巷

一段 3 到 4 分钟的网页实时体验(three.js WebGPU)。拆迁区里一间关了门的家电修理铺,黄昏。对街的店铺卷帘门都拉下了,墙上圈着"拆",有一栋已经拆了一半。老师傅用旧收音机外壳、相机镜头和水管拼的小机器人还坐在店里。按住,它的镜头光圈打开:
- **第一幕,店里**:光照到哪里,店里就回到从前——电视放着节目,收音机刻度灯亮着、响着曲子,挂钟在走。
- 街上一声车铃,它在凳子上转过身,面朝卷帘门外。
- **第二幕,街上**:光照到对街哪家店,那家就回到九十年代的傍晚——面馆冒着热气,理发店门口坐着邻居,电器店橱窗里的电视亮着——同时响起那家店的声音。
- 电量用完,光熄灭,街回到现在。最后一句:"它记得这条街亮着灯的样子。"

**店里的每一件旧物都是 Tripo 生成的 3D 模型**,原始网格直接上屏(按屏幕误差分级细节,近处显示完整的原始网格)。对街那一排店铺是两张生成的照片("现在"和"从前",公司素材中台),不是模型。

## 运行
需要 Node.js 20.19+ 或 22.12+。
```bash
npm install
npm run dev      # 打开终端里显示的地址(推荐 Chrome / Edge,支持 WebGPU;否则自动退回 WebGL2)
```
戴上耳机,点击画面开始。

## 操作
- **按住空格或鼠标左键**:让机器人的眼睛睁开(第一次总是失败,再按住一次)。按住期间眼睛一直睁着,松开就闭上。
- **移动鼠标**(或方向键):它的头跟着转,光照到的地方显出从前。手机上按住屏幕、滑动手指。
- 第一幕约 30 秒后它会自己转身;第二幕看过大部分店铺或电量用完就结束。
- 结尾字幕出现后,点击可重看。按 Enter 可以跳过开场的进门镜头;T 直接转身,D 直接结束看街(测试用)。

## 地址参数
| 参数 | 作用 |
|---|---|
| (无) | 修理铺故事(第四版) |
| `?review` | 第四版的模型检视模式:拖动旋转、双击模型看近景、数字键 1–8 切换机位,明亮的检视灯光 |
| `?scene=street` | 第三版雨夜老街 |
| `?phase=wait` / `look` / `street` / `end` | 跳到某一段(`look` 是第一幕店里,`street` 是第二幕街上) |
| `?speed=2` | 时间加速(测试用) |
| `?q=low` | 低画质(关环境光遮蔽、屏幕空间反射;阴影贴图减半) |
| `?dpr=2` | 渲染分辨率倍数(默认最高 1.5,帧时间长时自动降低) |
| `?lodmb=320` | 模型显存预算(MB,默认 600;设备内存 ≤4 GB 时自动 320) |
| `?mute` | 静音 |
| `?stats` | 帧率面板 |
| `?webgl` | 强制 WebGL2 |
| `?shot=<名字>` | 固定镜头截图模式(镜头列表见 `src/engine/shots.js`) |
| `?nolod` | 用旧的减面模型(对比用) |

## 工具
首次使用:`npx playwright install chromium`(工具只用 Playwright 自带的 Chromium,不会启动你自己的 Chrome);拼图需要 `ffmpeg`。
- `node tools/play-shop.mjs --speed 2 [--url http://127.0.0.1:5181/]`:自动玩一遍故事并截图(`renders/play-shop-sheet.jpg`),同时记录声音电平。
- `node tools/audio-capture.mjs`:实时录下一整遍的声音 → `docs/audio-preview-shop.mp3`。
- `node tools/shot.mjs <镜头> [--query "..."]`:单镜头截图 + 性能数据;`node tools/shop-fps.mjs <镜头>` 1080p 不限帧率的帧时间;`node tools/shop-fps-throttle.mjs <镜头> 4` CPU 降速 4 倍时的帧率。
- `tools/probe.sh <模型名> <输出目录> [--cut x:0:0.01] [--match "..."]`:在场景坐标里看 Tripo 模型的某个部位(电视屏幕、钟摆、风扇叶等定位用)。
- `node tools/marks-texture.mjs`:重画门边的铅笔身高刻度贴图。
- `tools/lod.sh` / `tools/lod-all.sh`:由 Tripo 原始模型生成分级细节(见 docs/tripo-compare/README.md)。
- `python3 tools/shop_layout.py`:重新生成摆放清单 `assets/models/shop/layout.json`。

## 目录
```
src/engine/        渲染器、主循环、后处理(含按深度逐像素的"过去"调色)、输入、镜头、three.js 修补
src/systems/shop/  第四版修理铺:index(房间、模型摆放、分级细节)、rig(机器人软颈)、eye(眼睛、光圈、光束、投影灯)、
                   past(光里的过去:电视、收音机、钟摆、影子)、atmo(灯光状态、灰尘、路灯)、story(故事与镜头)、sound(声音)
src/systems/       第三版雨夜老街的各系统
src/materials/     记忆光锥遮罩等
docs/              交接(HANDOFF.md)、汇报(REPORT.md)、审查记录(review-shop/)、模型对比(tripo-compare/)
```

## 制作
由 AI 团队协作完成:Claude(Opus 5.5,统筹与主要实现)、Codex(画面与故事审查;Grok 订阅过期前也参与审查)。工作流见 `docs/AI-TEAM-WORKFLOW.md`、`docs/VISUAL-REVIEW.md`。模型由 Tripo 生成,参考图和对街照片由公司素材中台生成。素材出处见 `CREDITS.md`。非商用,公司内部展示。
