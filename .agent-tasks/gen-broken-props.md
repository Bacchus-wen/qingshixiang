# 生图任务:四件旧家电的残破版参考图(用户已确认用你自带的生图工具)

**用户已确认以下计划**(2026-10-23,用户原话:"生图就是用codex,我有订阅,可以生图";选择了"每件 4 张挑 1"、"用这一版提示词"):

- 工具:你(Codex CLI)自带的生图/改图工具。
- 方式:图生图。每件先打开它的原参考图(下表),以原图为参考做编辑,只改"新旧",物件的形状、比例、颜色、材质、角度、构图、背景都不变。
- 尺寸:1024×1024。不透明,保持原图同样的浅灰色无缝摄影棚背景。
- 数量:每件 4 张,共 16 张。不要多生成,也不要少生成;某一张失败可以重试那一张,总数仍是 16 张。
- 不要生成任何其他图片。

| 物件 | 原参考图(只读) | 输出(PNG,按这个路径保存) |
|---|---|---|
| 电视 crt_tv | `assets/generated/shop/refs/crt_tv.png` | `assets/generated/codex/broken/crt_tv/1.png` … `4.png` |
| 摆钟 wall_clock | `assets/generated/shop/refs/wall_clock.png` | `assets/generated/codex/broken/wall_clock/1.png` … `4.png` |
| 台扇 desk_fan | `assets/generated/shop/refs/desk_fan.png` | `assets/generated/codex/broken/desk_fan/1.png` … `4.png` |
| 收音机 tube_radio_closed | `assets/generated/shop/refs/tube_radio_closed.png` | `assets/generated/codex/broken/tube_radio_closed/1.png` … `4.png` |

如果你的生图工具把图片存在别处,请复制到上表的路径。

## 提示词(用户已确认,原文使用)

每条都以这段开头:

> Edit the reference image. Keep exactly the same object: the same model, shape, proportions, colours, materials, camera angle, framing and scale, the entire object fully in frame with generous margin, isolated on the same plain light grey seamless studio background, soft even studio lighting, no cast shadows. Show it decades later, abandoned in a derelict shop:

后面接各自的一段:

- **crt_tv**:the screen glass smashed with a star-shaped crack radiating from a hole near the centre and a few shards missing, the upper channel knob broken off leaving a bare shaft, one antenna rod bent sideways and the other snapped short, a thick layer of grey dust on the top, the wood-grain cabinet faded, scratched and water-stained, one front corner chipped. No text, no logos, no people, sharp focus, photorealistic.
- **wall_clock**:the glass door cracked diagonally from corner to corner, the pendulum broken off and lying at the bottom of the case, the minute hand missing and the hour hand hanging loose, the dial yellowed with brown water stains, the wooden case dusty with peeling varnish, the carved crest on top split. No text, no logos, no people, sharp focus, photorealistic.
- **desk_fan**:the chrome wire cage dented and pushed in on one side with a few wires snapped and sticking out, one of the four blades broken off, the pale green enamel chipped and rusted in patches, dust on the motor housing and the base, one push button missing. No text, no logos, no people, sharp focus, photorealistic.
- **tube_radio_closed**:the cloth speaker grille torn and sagging at one corner, the tuning dial glass cracked, the middle knob missing, two piano-key buttons broken off, the wooden veneer peeling and water-stained at the edges, a layer of dust on the top. No text, no logos, no people, sharp focus, photorealistic.

## 交回

在回复里列出 16 个文件的路径和像素尺寸,每张一句话说明和原图相比形状有没有变(变了的写清哪里变了)。不要改项目里的其他任何文件。
