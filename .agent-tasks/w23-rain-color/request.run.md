【说明】你在项目的一份独立副本里工作，当前目录就是项目根目录。只在当前目录内读写，路径一律用相对路径。任务结束后，系统会核对你的改动并把声明范围内的部分带回原项目。node_modules、dist、.godot 这类构建或缓存目录里的改动，只有任务声明的路径点名了它们才会带回。

# w23:雨丝吃到霓虹的颜色(Grok 中期评审第 5 条)
你在 r13 里写:"neon-past 的雨丝仍是灰线,不吃粉和青。cyber 的雨带着招牌的颜色。"请你自己实现。
- 改 src/systems/rain/**(雨系统,Codex 写的,GPU 粒子 + TSL)。雨丝颜色乘上所在位置附近霓虹的颜色,权重 0.4,只在有灯的地方提亮;机器人眼睛光束里的雨亮度 ×3(光锥判定用 src/materials/memory.js 的 memoryMask,光束本身的颜色在 ctx.memory / robot 的 spot.color)。
- 霓虹的位置和颜色:src/systems/neon/ 的系统会发布 ctx.api.neon(读一下它的 index.js 看暴露了什么;如果没有位置列表,就用 ctx.api.street.facades 推算,或者在 rain 里用 uniform 数组接收最近的 8 块招牌,每 0.5 秒在 CPU 上更新一次)。
- 不新建 THREE 灯光(运行中改灯光数量会全局重编译)。性能:雨的绘制调用数不变。
- 可写:src/systems/rain/**。不启动浏览器/Vite/Blender(会让用户电脑弹崩溃窗)。result.md 写在任务目录,写清 Claude 怎么截图验收。截止 18:55。
