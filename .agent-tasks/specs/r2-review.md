# 任务:核心代码审查(只读)

先读 AGENTS.md。请审查 Claude 写的这些文件(three.js 0.186.1 WebGPU/TSL):
src/engine/Engine.js、src/engine/PostFX.js、src/materials/{surface,wet,memory}.js、src/systems/street/{index,details,props}.js、src/systems/atmo/index.js、src/systems/robot/{index,materials}.js、src/story/director.js、src/ui/film.js。
重点:
1. 正确性 bug(状态机、坐标系、uniform 同步时序、TSL 节点用法错误、反向 smoothstep 之类)。
2. 性能:每帧分配(new Vector3 等)、过多 draw call、阴影贴图数量、体积步数、TRAA/SSR 设置;按中档笔记本 60 帧给出最该改的 5 处。
3. WebGL2 回退会坏掉的地方。
4. 导演系统的体验漏洞(用户不按、乱按、窗口失焦、重复进入阶段等)。
按"致命 / 重要 / 可优化"三级列出,每条给文件:行号、证据和具体改法。不要泛泛而谈。
只读,不需要联网,不要启动任何程序。中文,1500 字以内。
