# 任务:技术与工具调研——做"顶级氛围"的网页实时 3D 短体验还能用什么(只读,可联网)

## 背景
项目 新游戏(先读项目根目录 AGENTS.md、docs/concept-ruin.md):3 到 8 分钟网页短体验,**氛围是最重要的**,故事可以很薄。方向自由:荒凉、绝境、孤独的感觉,不一定是雨夜废城。技术底座:three.js 0.186.1 WebGPURenderer + TSL、Vite、无界面 Blender 5.2 脚本、Playwright 截图验收、Web Audio。用户只知道 CSS / three.js / Blender,希望 AI 团队像专家一样主动找出"还能用什么"。
禁止:Tripo 和任何付费生成。允许:免费开源工具、CC0 素材、本地运行的免费模型。共享工具会装到 ~/Tools,供多个项目复用。

## 要做什么
联网调研并**核实**(看仓库是否在维护、许可证、是否支持 three r18x / WebGPU),按类列出最值得用的东西,每项写:名字、链接、许可证、它能给氛围带来什么、怎么装(一行命令)、风险。
1. 渲染与着色:WebGPU/TSL 的体积雾和体积光、GPU 粒子(compute)、SSR/SSGI/AO、全局光照近似、高斯泼溅渲染(如 Spark)、SDF 光线步进、天空与大气散射。
2. 程序化内容:Blender 几何节点或 Python 生成建筑与废墟、Blender 无界面烘焙(AO、光照贴图、贴图)、程序纹理工具。
3. CC0 / 免费素材源:贴图、HDRI、模型、音效(Poly Haven、ambientCG、Kenney、Quaternius、Freesound CC0 等),说明是否有 API 可脚本下载。
4. 资源压缩:gltf-transform、meshopt、KTX2/basis、纹理格式选择。
5. 声音:程序音频库、卷积混响、空间音频、免费的脉冲响应库。
6. AI 自动化与验收:让 AI 操控浏览器、读取性能数据、GPU 帧调试的工具(例如 Chrome DevTools MCP、Playwright、Spector.js 等),以及可用于 three.js 的 Claude Code / Codex skill 或 MCP。
7. 近两年网页 3D 里"氛围做得最好"的 5 到 8 个作品或作者(three.js / WebGPU),每个一句话说明它做对了什么。
最后给出"立刻安装"的前 10 项排序。

## 权限
只读,可以联网。不得调用付费生成。不要修改项目里的任何文件。

## 交回格式
中文 Markdown,2000 字以内,链接必须真实可访问。
