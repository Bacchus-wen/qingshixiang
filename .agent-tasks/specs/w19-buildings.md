# w19:把 cybercity 的楼体做法移植到我们的街(第二版画面的核心)

背景:用户对比参考视频后觉得我们的场景太粗。用户授权(公司内部展示)直接使用 reference/cybercity 的素材和做法。
第二版方向见 docs/PLAN-v2.md:**现在暗但看得清,记忆(光锥里)满街彩色霓虹和灯火**。故事不变(中国南方待拆老街)。

## 要做
1. 读 `reference/cybercity/src/systems/buildings/`(materials.js 的 createFacadeMaterial:贴图集墙面 + 法线 + 程序窗户 + 内部映射房间;shops.js;props.js)和 `assets/textures/buildings/`。
2. 把我们 `src/systems/street/index.js` 里楼体的材质换成这种做法(布局和 facades 数据结构不变,fragment/micro/wind 等都依赖它们):
   - 墙面用 atlas_albedo / atlas_normal(混凝土、瓷砖、砖、铁皮等),按楼随机选格子;保留我们的湿润层(materials/wet.js 的 wetness 规则:竖直面只轻微变暗,不要水膜)。
   - 窗户 + 内部映射(interior_atlas)。**现在**:绝大多数窗户黑着(玻璃反一点冷光),每条街 2–4 扇亮着昏暗冷光(还有人没搬走);**记忆里**(`memoryMask(positionWorld)` > 0):几乎所有窗户亮起暖色室内,能看到房间内部。原来的 `pastWindowGlow` 逻辑可以替换。
   - 窗框、防盗窗(中国老楼特征:窗外的铁栏)、空调外机(cybercity 的 ac_unit.glb 可用)、雨棚。
   - 店面:卷帘门用 shutter.png;记忆里卷帘门升起后能看到店内(shelves.png、shop_*.png 作为店内背板,开灯)。注意 shop_ramen 等带日文,优先给"张记面馆"这类我们故事里的店用最接近的那张,其他用货架/通用店内。
3. 贴图转换:放到 `assets/textures/cc/`,转成 jpg(法线也可 jpg,质量 90),最长边 ≤ 2048;总增量 ≤ 10MB。用 ffmpeg 或 sips 转换(命令行即可,不要开 GUI)。
4. 性能:楼体仍按材质合并(street/merge.js);一种楼体材质 + 少量细节材质,别让绘制调用暴涨(现在街景约 500)。
5. 在 CREDITS.md 里记下用了 cybercity 的哪些文件(写明:xikhar/cybercity,无许可证,仅限公司内部展示)。

## 范围与规则
- 可写:`src/systems/street/**`、`src/materials/**`、`assets/textures/cc/**`、`assets/models/cc/**`、`CREDITS.md`。Claude 同时在改 `src/systems/robot/**`,不要碰。
- 不启动浏览器、Vite、Blender;Claude 来截图验收(`node tools/shot.mjs street-eye` / `memory-street` / `flood`)。
- 在 result.md 里写清:改了什么、怎么在记忆和现在之间切换、有哪些调试参数、你担心的地方。
