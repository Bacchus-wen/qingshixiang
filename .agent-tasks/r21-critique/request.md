第六轮严格批判(r21,只读)。项目 ~/Games/新游戏:three.js WebGPU 网页体验,雨夜待拆老街,残破测绘机器人的眼睛光束照出过去;高潮是门框上的铅笔身高刻度。**这个作品是为了宣传 Tripo 生成的 3D 模型。**

用户刚看完很失望:"物体悬浮卡在空中,猫很丑,机器人一看就没用心生成,模型很差;网页 1.4G,别人的设备很卡。" 请你按用户的标准批判,不要客气,不要只提调参数。

只读:不要运行构建、浏览器、Blender、Vite,不要改文件。

看 docs/review8/ 里的近景图(props-left/right/deep、junction 是道具近景;robot-wide、eye-hero 是机器人;fragment-marks 是门;look-beam、play-06 是主视角;play-14 是结尾;playthrough.jpg 是全程 16 帧),对照参考:reference/x-cyber.mp4 的截帧 docs/review3/ref-cyber-*.jpg 和 docs/targets/*.jpg。

请按顺序交:
1. **模型质量**:逐个点名哪些模型粗糙、比例不对、像拼凑、贴图糊、低多边形露馅;哪些是 Tripo 生成的(assets/models/v2/、assets/generated/tripo3/)看起来如何。哪几个模型必须用 Tripo 重做才能拿去宣传 Tripo,按优先级排。
2. **悬空、穿插、漂浮、贴图错位**:每处写帧名和位置。
3. **卡顿与体积**:从代码看(src/engine/PostFX.js、Engine.js、src/systems/**,dist/ 里的文件大小),内存和显存最可能花在哪里,给出能把整体降到 500 MB 以下、在普通笔记本上流畅的具体做法(贴图压缩、减面、渲染目标分辨率、关掉哪些效果)。
4. 一段对我(Claude)这 10 小时工作方式的批评:哪里方向错了。
把全文作为回复(result.md)交回。
