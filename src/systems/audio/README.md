# 雨巷音景：程序合成 + 现场录音

2026-10-16 / w16-recordings：录音接入已实现，`node src/systems/audio/verify.mjs` 与 `npm run build` 通过；真实 Web Audio 渲染、耳机试听和浏览器验收交由 Claude 在沙箱外完成。本轮交付只包含 `src/systems/audio/**`。

## 声音与混音

实时与离线渲染共用 `graph.js`。合成层提供雨滴、滤波噪声、机械动作、记忆声场、灯接触不良和远雷；`recordings.js` 叠加 `assets/audio/rec/` 中已处理的现场录音（运行时 `/audio/rec/<名字>.mp3`，共约 2.9 MB）。不调用付费生成服务。

| 录音 | 行为 |
| --- | --- |
| `rain_roof_loop` | 近处卷帘/铁皮雨，略偏左，跟随 `levels.nearRain` |
| `rain_puddle_loop` | 中远处积水雨，立体声，跟随 `levels.farRain` |
| `gutter_drip_loop` | 近处金属滴水，略偏右，跟随 `levels.drips` |
| `city_far_loop` | 现在很弱，随 `ctx.memory.strength` 抬高；跟随 `levels.memory` |
| `wind_loop` | 跟随 `ctx.world.windGust` 和 `levels.wind`；缺少 wind 系统时 gust 取 0.2 |
| `radio_loop` | 仅在记忆中淡入，`ctx.memory.floodNow` 使它更清楚；偏左、很轻，跟随 `levels.radio` |
| `wind_gust` | gust 上升超过 0.55 触发，低于 0.35 后重新允许，跟随 `levels.wind` |
| `thunder_roll` | 与合成雷共用一次闪电的 2–6 秒延迟，跟随 `levels.thunder` |
| `dog_far_a/b` | 随机选一段，45–120 秒一次；低通、低干声和较高混响比例，跟随 `levels.dog` |
| `relay_a/b/c` | 随机选一段；同帧睁眼动作只加一次、失败 click 再加一次，也可显式 `play('relay')`；跟随 `levels.click` |

三条录音雨层接在现有雨总线之前，统一跟随 `ctx.world.rain`，并接受记忆的压低和低通。总线后的短混响和巷道长尾也会收到真实雨声。城市/收音机不经过雨的压低总线。

对应录音成功加载且 `rec=1` 时，合成近雨、远雨、风各减 35%；`rec=0` 时恢复完整合成增益，加载失败的对应层也保留完整合成增益。风的默认滑杆从 0 调到 0.25，以启用轻微的巷风；可用 `audio.wind=0` 同时关闭合成风和录音风。合成狗叫只作为录音未加载、失败或关闭时的回退；现场录音已是一整段叫声，不按合成狗叫的 1–2 声再重复叠放。

原有合成收音机仍保留局部光锥、距离和左右声道响应；新增的录音收音机只跟随全局记忆强度及 flood。合成记忆层原有 2.5 秒进入和快速离开逻辑保持不变。

## 加载与生命周期

- 实时模式只在首次 pointerdown/keydown 创建 AudioContext 后发起 fetch + decodeAudioData；立即 resume 并开始合成，不等待下载。
- 各文件独立加载、独立失败回退，不抛出未处理异常、不补播加载期间错过的单发。
- 六条循环使用 `AudioBufferSourceNode.loop`，`loopStart=0.06`、`loopEnd=duration-0.06`，从 0.06 秒偏移启动，淡入避免突然接入。
- `dispose()` 终止加载、停止声源并断开节点；晚到的 decode 结果被丢弃。录音单发结束后释放节点，实时最多 16 个录音单发并发（合成单发原上限 48）。
- 所有声音通过现有高通、压缩器和 master。调度采用 AudioContext 时间，不受确定性截图的模拟时间加速影响。

## 使用与 A/B

```js
ctx.api.audio.play('servo', { duration: 1.2, gain: 0.7, pan: -0.2 });
ctx.api.audio.play('click');
ctx.api.audio.play('relay', { gain: 0.5 });
ctx.api.audio.levels.rec = 0; // 关闭全部录音输入，合成层恢复原增益
ctx.api.audio.levels.rec = 1; // 恢复录音
ctx.api.audio.setMuted(true);
```

`levels` 均为 0..1：master、nearRain、farRain、drips、wind、lamp、thunder、memory、servo、click、shutter、whine、reverb、dog、radio、alley、**rec（默认 1）**、**passingCar（默认 0.3）**。

## 远处路口的现在车辆（w17）

`passing.js` 每帧读取 `ctx.world.passingCar = { x, z, k }`，不另外调度车辆。一条固定种子的单声道循环噪声产生湿胎嘶声和低频粗糙声，54 Hz 三角波产生轻微发动机声；两条声源只在解锁音景时启动一次，后续过车不新建或重复触发。没有新增录音、下载或定时器，销毁音景时停止声源并断开节点。

距离按摄像机世界坐标计算，缺少摄像机时取机器人附近 `(0, 1.6, -10)`；按逆平方形式衰减，路口中央最近最响，声像随相对位置和摄像机朝向变化。胎声先限制到约 170–1450 Hz，发动机低通到 150 Hz。干声为 0.24，湿声为 `3.5 * levels.reverb`（默认约 0.77），复用已有 2.8 秒混响脉冲。车辆自己的混响输出与干声一起接受现有 `mixState.cutoff` 控制（记忆中降到 850 Hz），随后经过存在感/距离增益和原有主压缩器、master；不经过雨量总线，因此无雨和记忆中仍会存在。`k=0`、世界状态缺失或滑杆归零时，最终增益在 30 ms 内归零，包括车辆的混响尾音。

沙箱外试听用 `?passcar`，手势解锁后约第 2 秒出现；`?passcar&audio.passingCar=0` 可做 A/B，`audio.rec=0` 不会关掉合成车声。检查左右两个方向、路口中央音量、记忆开合和多次过车；实际响度与混响比例仍需 Claude 沙箱外听验。`verify.mjs` 覆盖缺失/无效输入和 `k=0` 静音、距离衰减、双向声像、记忆低通、完整音景接入、连续帧/后续过车不增加或重启声源、音量归零及销毁。

离线 DSP 试听可向 `renderOffline()` 传 `passingCar` 对象或函数，例如：

```js
await renderOffline({ seconds: 16, effects: false, storm: false, memory: 0,
  passingCar: t => {
    const x = -58 + (t - 2) * 9.5;
    return { x, z: -42, k: Math.max(0, Math.min(1, (58 - Math.abs(x)) / 12)) };
  },
});
```

本次只做 Node 控制/路由/生命周期测试和静态检查；未启动浏览器、Vite 服务或 Blender，未做实际 DSP、试听或截图验收。集成方验收后再记入 `docs/PROGRESS.md`。

URL 示例：`?audio.rec=0` 与默认值对照，`?volume=0.5&audio.wind=0.25`，`?mute`，`?skip=audio`。`rec` 是平滑输入增益；关闭后已有的混响自然衰减，完全静音使用 `setMuted(true)`。手势前调用不积压音效；显式 relay 在没有可用录音时返回 false。

## 离线渲染

`renderOffline()` 在排定乐谱和调用 `startRendering()` 前等待 `graph.recordingsReady`。HTTP(S) 页面会从同源加载录音；Node 或 `about:blank` 没有音频服务器时自动跳过，仍运行合成层验证。`rec` 是总量控制而非独立声源，因此不参加“每个合成层必须非静音”的断言。

可以注入 `loadBuffer(name, audioContext, abortSignal)` 返回解码后的 AudioBuffer，让无服务器的离线环境也使用真实录音：

```js
const result = await renderOffline({
  loadBuffer: async (name, ac) => {
    // bytesByName 由验收工具读取 assets/audio/rec/ 后传入浏览器页面。
    const bytes = bytesByName[name];
    if (!bytes) return null;
    return ac.decodeAudioData(Uint8Array.from(bytes).buffer);
  },
  windGust: t => t < 5 ? 0.2 : 0.8,
});
// result.recordings 列出本次实际加载的文件，不把合成回退误认为录音验收。
```

`runOfflineTest({ loadBuffer })` 也支持注入，主混音和静音测试会包含录音，独立合成层断言仍隔离录音。直接使用 `createSoundscape()` 的导出工具同样可传 `loadBuffer`，并在安排 update/schedule 和 startRendering 前 `await graph.recordingsReady`。现有 `tools/audio-render.mjs` / `tools/audio-export.mjs` 在空白页运行，默认安全跳过录音；如需导出带真实录音的试听，Claude 需在工具侧传入上述字节并等待 readiness，或改在有同源资源的页面使用 `renderOffline()`。本任务范围未修改这两个工具。

## 验证与交接

沙箱内允许执行：

```sh
node src/systems/audio/verify.mjs
npm run build
```

`verify.mjs` 覆盖原有控制逻辑及 `verify-recordings.mjs`：手势后加载、不阻塞合成、HTTP/解码单条失败、循环边界、共用雨总线、记忆/flood、阵风迟滞、录音 A/B 与合成回退、雷声同步、机器人继电器去重、狗叫替换、单发释放和销毁期间迟到的解码。测试替身只验证路由/调度/生命周期，不冒充实际 DSP 或听感验收。

Claude 沙箱外验收：先运行 `node tools/audio-render.mjs` 检查原有 DSP 回归；再按上述录音注入方式导出试听，确认 `result.recordings` 有全部 13 条，比较默认与 `audio.rec=0`，听雨循环接缝、记忆开合、flood、闪电延迟和长时间狗叫间隔。最后用项目规定的截图工具验收并在 `docs/PROGRESS.md` 记录结果；本任务未启动浏览器、Vite 或 Blender，未修改全局进度文件。
