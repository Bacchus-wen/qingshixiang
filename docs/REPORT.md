# 汇报文档(给用户,12 小时后阅读)

开发时段:2026-10-16 03:30 起,约 12 小时。最新的内容在最上面的"当前状态",下面是按时间的流水记录。

## 当前状态(03:45)
- 能跑的场景:一条银盐质感的雨夜窄巷(`npm run dev` 打开即是)。有体积光柱、高度雾、湿地面反射(SSR,只作用于朝上的湿面)、GPU 雨(Codex 写)、积水与涟漪。
- 截图:`docs/snap-0345-street.png`。
- 下一步:残破机器人 + 机械眼 + 光锥显影(核心交互)。

## 怎么运行
```bash
cd ~/Games/新游戏
npm run dev          # 浏览器打开显示的地址
node tools/shot.mjs lookdev   # 自动截图到 renders/
```

## 流水记录
- 03:30 搭好团队与工具:项目移到 ~/Games/新游戏;引擎骨架 + 自动截图(WebGPU);~/Tools 共享工具箱(gltf-transform、cc0-fetch、three 官方示例参考);Grok 完成参考调研并提出三个差异化方向;Codex 完成剧情方案与技术风险审查。
- 03:30 定方向:**银盐的现在,一色的记忆**(docs/art-direction.md)。现在的世界无彩色,只有机器人的眼睛是彩色光,光锥里显出过去。
- 03:30 Blender:不用 MCP,改为常驻无界面 Blender 工具(Codex 在写),质量等价且能无人值守。
- 03:20 事故:Chrome 与 Blender 弹出崩溃。原因是截图工具借用了你的 Chrome,以及 Codex 在沙箱里启动 Blender。已修:截图只用 Playwright 自带 Chromium;Blender 退出不走清理流程;规定 Codex/Grok 在沙箱里不启动任何图形程序或端口服务,画面验收由 Claude 在沙箱外做。写入 AGENTS.md 和长期记忆。
- 03:25 Codex 交回:常驻无界面 Blender 工具(已由 Claude 实测通过,装进 ~/Tools/bin/blender-live)、GPU 雨系统(6 万雨丝、雨幕、落地涟漪、光锥内雨滴染琥珀色)。Codex 美术审查指出 5 个风险(投影仪感、体积穿墙、TRAA 拖影、色彩规则、技术堆叠),已采纳:投影贴图只放低频遮光纹,"过去"用真实几何和材质变化表现。
- 03:25 Grok 交回工具调研(docs/toolscan-grok.md):已装 stats-gl、WebGPU Inspector(含 Claude 插件,备用);其余记在 ~/Tools/README.md 备忘。
- 03:45 修好两个渲染 bug:SSR 反射到墙面(改为在材质阶段写"朝上"遮罩)、马路平面法线错误(改为薄盒子)。湿地面倒影成立。
