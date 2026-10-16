【说明】你在项目的一份独立副本里工作，当前目录就是项目根目录。只在当前目录内读写，路径一律用相对路径。任务结束后，系统会核对你的改动并把声明范围内的部分带回原项目。node_modules、dist、.godot 这类构建或缓存目录里的改动，只有任务声明的路径点名了它们才会带回。

# w16-recordings:把真实现场录音混进程序音景

背景:声音目前全部程序合成。Grok 找到了 CC0 / CC BY 的真实录音(见 .agent-tasks/r7-sounds/result.md),
Claude 已经剪好、做成无缝循环和单发音效,放在 `assets/audio/rec/`(运行时 URL `/audio/rec/<名字>.mp3`,共 2.9MB)。
每条已响度归一(约 -24 LUFS 循环 / -22 LUFS 单发),循环已把尾部交叉淡入到开头(首尾无缝)。

## 文件与用途
| 文件 | 类型 | 用途 |
|---|---|---|
| rain_roof_loop (36s 立体声) | 循环 | 近处铁皮/卷帘上的雨。机器人背后是卷帘门,略偏左。跟 ctx.world.rain |
| rain_puddle_loop (40s 立体声) | 循环 | 路面积水的雨,中远。跟 ctx.world.rain |
| gutter_drip_loop (40s 单声道) | 循环 | 屋檐滴在金属上,近,偏右一点 |
| city_far_loop (15s 立体声,已低通) | 循环 | 远处城市的底噪。**现在**很弱;**记忆光锥打开时**(ctx.memory.strength)抬高:过去的城市是活的 |
| wind_loop (56s 立体声) | 循环 | 窄巷夜风。增益跟 `ctx.world.windGust`(0..1,wind 系统每帧写入;没有 wind 时视为 0.2) |
| radio_loop (40s 单声道,已带通) | 循环 | 短波收音机的杂音与听不清的人声。**只在记忆里**:跟 memory.strength 淡入,很轻,像某家店里开着的收音机;flood(ctx.memory.floodNow)时更清楚一点 |
| wind_gust (9s) | 单发 | windGust 上升越过 0.55 时触发一次(之后低于 0.35 才重新允许) |
| thunder_roll (13s,已低通) | 单发 | 和现有合成远雷叠在一起(同一次闪电触发,同一延迟),合成雷保留但可以减一点 |
| dog_far_a / dog_far_b (5–6s) | 单发 | 很远的狗叫。若已有合成狗叫,改为随机用录音(45–120s 一次,很远:低通+混响+低音量) |
| relay_a/b/c (0.9s) | 单发 | 机器人内部继电器的咔嗒。睁眼开始、第一次失败、电量断续时用(现有 servo/click 调用处加一个,或注册为 `play('relay')`) |

## 要求
- 只改 `src/systems/audio/**`。加载:用户手势创建 AudioContext 之后 fetch + decodeAudioData,**异步、不阻塞开始**;任何一条加载失败就静默跳过(合成层照常)。
- 循环用 AudioBufferSourceNode.loop;为避开 mp3 编码首尾的填充,设 loopStart=0.06、loopEnd=duration-0.06。
- 录音层与合成层是**叠加**关系:录音给真实质感,合成层给可控的细节。把合成近雨/远雨/风各降约 30–40%,让总响度大致不变。主观目标:耳机里像真的站在雨夜的巷子里,而不是白噪声。
- 记忆打开时:现有逻辑会压低并低通雨声;录音雨层同样走这个低通/压低。city_far 与 radio 抬高,作为"过去的声音"。
- `levels` 里新增 `rec`(录音总量,默认 1)以及 `?audio.rec=0` 可以关掉全部录音层,方便 A/B。
- 离线渲染(offline.js / tools/audio-render.mjs)也要能用录音:Node 里没有 fetch 到 /audio 的服务器时允许跳过录音层(断言不应因此失败)。更新 verify.mjs 让它通过。
- 不启动浏览器、Vite、Blender;Claude 来做浏览器验收(tools/audio-render.mjs、audio-export)。
- 更新 src/systems/audio/README.md:说明录音层,以及"没有音频文件"那句话改掉。
