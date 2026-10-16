【说明】你在项目的一份独立副本里工作，当前目录就是项目根目录。只在当前目录内读写，路径一律用相对路径。任务结束后，系统会核对你的改动并把声明范围内的部分带回原项目。node_modules、dist、.godot 这类构建或缓存目录里的改动，只有任务声明的路径点名了它们才会带回。

# w25:雨丝吃到霓虹颜色(上次派给 Grok 超时,改派给你)
评审(.agent-tasks/r13-midreview/result.md 第 5 条):雨丝仍是灰线,不吃粉和青;参考视频的雨带着招牌的颜色,光束里的雨是亮的。
- 改 src/systems/rain/**(你写的)。雨丝颜色乘上所在位置附近霓虹的颜色(权重 0.4,只在有灯的地方提亮);机器人眼睛光束里的雨亮度 ×3(用 src/materials/memory.js 的 memoryMask)。
- 霓虹位置和颜色:ctx.api.neon.signs(数组,每项有 x, y, z, tint;src/systems/ghosts/life.js 的 streetTint 就是这么用的)。在 CPU 上每 0.5 秒挑离镜头最近的 8 块,写进 uniform 数组;在雨的着色器里按距离衰减叠加。现在(没在记忆里)只有残存亮着的那几块起作用,而且乘 mains(src/materials/memory.js 导出的 uniform,跳闸时变暗)。
- 不新建 THREE 灯光;雨的绘制调用数不变。
- 可写 src/systems/rain/**。不启动浏览器/Vite/Blender。result.md 写在任务目录,写清 Claude 怎么截图验收(建议 street-eye?neon=past、flood)。时间 40 分钟内。
