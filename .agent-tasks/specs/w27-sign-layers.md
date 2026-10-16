# w27(辅助):招牌竖向分层 + 支架结构 + 店面筒灯
按 docs/cybercity-digest.md 第 7 节和第 4 节 d 条做。可写 src/systems/neon/**(layout.js、atlas.js、geometry.js、materials.js)。
- 从第 3 层到顶层下一层,每层以 0.32 的概率再挂一块(霓虹字 2.5–7 m、方灯箱、上层小竖招,每栋最多 2 块额外);竖招两侧框条、上下支臂、斜撑;45% 带 LED 边条。
- 灯管遮罩三层描边做出白芯(×1.0 透明 0.35、×0.6 透明 0.7、×0.3 透明 1.0),materials.js 记忆态加白芯,管强度 3.6→5。
- **重要:src/systems/neon/index.js 里 Claude 加了 ctx.lightPool 的代码(每块招牌注册一盏真点光源、每间店一盏暖光),保留它;新增的招牌也要注册进 lightPool(同样的写法)。** 还要保留 sign.power(geometry.js updatePowers 里写入,光源闪烁用)。
- 绘制调用 ≤ 18。不启动浏览器/Vite/Blender。result.md 写在任务目录。
