# w24:记忆里的行人换成会走路的真实人物(移植 cybercity 的人群)

用户:"人物的运动对你来说较难,可以找有助于提效的方法和工具。"cybercity 已经有一整套:reference/cybercity/assets/models/crowd/(male.glb、female.glb 各约 7.5MB,带多套服装和动画,json 里有服装/面数/LOD 信息)和 reference/cybercity/src/systems/crowd/(vat.js 顶点动画贴图、characters.js、agents.js、index.js:实例化走路人群)。用户已授权内部展示使用。

要做(可写 src/systems/ghosts/**、assets/models/crowd/**):
1. 把 cybercity 的走路人群移植成我们"记忆里的行人":两侧人行道各 6–10 人,真的在走(VAT 或 AnimationMixer 均可,选你能最快做稳的),多数撑伞(伞可用简单几何:深色或半透明,被霓虹照亮),服装优先 rain / street 标签。
2. 只在记忆里出现(memoryMask / memoryMaskCPU,洪流时整条街都有);现在的 life.js 里的彩色霓虹边光、撑伞位置等可以保留复用。人物材质:身体偏暗,吃附近霓虹的彩色边光(life.js 已有取最近招牌颜色的逻辑)。
3. **离镜头 2.5 米以内淡出**(现在洪流里有个人贴在镜头前,占了半个画面)。
4. 体积:模型只带需要的服装,能减就减(gltf-transform:~/Tools/bin/gltf-transform,可用 dedup/weld/resize/meshopt;不要 quantize 以免破坏骨骼或 VAT);总增量 ≤ 8MB。
5. 预热:首 30 帧编译所有材质,预热期间 frustumCulled=false。绘制调用 ≤ 10。
6. 门的那段记忆(src/story/fragment.js 用 crowd uniform 把人群淡出)要继续生效:沿用 ghosts/index.js 导出的 crowd。
7. 调试 ?memlife=1 强制显示。
不启动浏览器/Vite/Blender。result.md 写在任务目录。截止 19:05(用户 19:30 展示,19:15 冻结)。如果 19:05 前来不及,交回能用的部分并写清楚。
