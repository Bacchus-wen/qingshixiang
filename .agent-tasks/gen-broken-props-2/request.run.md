【说明】你在项目的一份独立副本里工作，当前目录就是项目根目录。只在当前目录内读写，路径一律用相对路径。任务结束后，系统会核对你的改动并把声明范围内的部分带回原项目。node_modules、dist、.godot 这类构建或缓存目录里的改动，只有任务声明的路径点名了它们才会带回。

# 生图任务(续):收音机的 4 张残破版参考图(用户已确认用你自带的生图工具)

上一个任务(gen-broken-props)在 15 分钟时限内完成了电视、摆钟、台扇各 4 张,收音机没来得及。**这次只做收音机的 4 张**,其余设置和上一个任务完全相同,用户确认的总数(16 张)不变。

**用户已确认以下计划**(2026-10-23,用户原话:"生图就是用codex,我有订阅,可以生图";选择了"每件 4 张挑 1"、"用这一版提示词"):

- 工具:你(Codex CLI)自带的生图/改图工具。
- 方式:图生图。每件先打开它的原参考图(下表),以原图为参考做编辑,只改"新旧",物件的形状、比例、颜色、材质、角度、构图、背景都不变。
- 尺寸:1024×1024。不透明,保持原图同样的浅灰色无缝摄影棚背景。
- 数量:只做收音机 4 张。不要多生成,也不要少生成;某一张失败可以重试那一张,总数仍是 4 张。不要再生成电视、摆钟、台扇。
- 不要生成任何其他图片。

| 物件 | 原参考图(只读) | 输出(PNG,按这个路径保存) |
|---|---|---|
| 收音机 tube_radio_closed | `assets/generated/shop/refs/tube_radio_closed.png` | `assets/generated/codex/broken/tube_radio_closed/1.png` … `4.png` |

如果你的生图工具把图片存在别处,请复制到上表的路径。

## 提示词(用户已确认,原文使用)

每条都以这段开头:

> Edit the reference image. Keep exactly the same object: the same model, shape, proportions, colours, materials, camera angle, framing and scale, the entire object fully in frame with generous margin, isolated on the same plain light grey seamless studio background, soft even studio lighting, no cast shadows. Show it decades later, abandoned in a derelict shop:

后面接这一段:

- **tube_radio_closed**:the cloth speaker grille torn and sagging at one corner, the tuning dial glass cracked, the middle knob missing, two piano-key buttons broken off, the wooden veneer peeling and water-stained at the edges, a layer of dust on the top. No text, no logos, no people, sharp focus, photorealistic.

## 交回

在回复里列出 4 个文件的路径和像素尺寸,每张一句话说明和原图相比形状有没有变(变了的写清哪里变了)。不要改项目里的其他任何文件。
