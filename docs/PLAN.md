# 总计划(AI 团队自主推进,Claude 统筹)

开始时间:2026-10-16 03:00。目标:约 12 小时内做出一个能从头玩到尾的 3 到 8 分钟体验。
每完成一项就在 `docs/PROGRESS.md` 记一行,并在这里把 `[ ]` 改成 `[x]`。

## 阶段 0:方向(并行,约 1 小时)
- [x] r0-refs(Grok):参考调研 + 三个差异化美术方向
- [x] r0-story(Codex):三个剧情方案 + 光锥双状态技术风险
- [x] Claude 综合,写 `docs/art-direction.md` 和 `docs/story.md`,必要时发起一轮互评

## 阶段 1:荒凉的基调(约 3 小时)
- [x] 街道布局:一条街 + 一个路口,程序化楼体、店面、卷帘门、积水低洼(Claude)
- [x] 雨:近景雨丝、远景雨幕、溅水、屋檐滴水(派 Codex,`src/systems/rain/`)
- [x] 湿润材质:变暗、水膜、积水、涟漪法线(Claude,`src/materials/wet.js`)
- [x] 个位数光源 + 雾 + 后处理调色(Claude)
- [x] 程序音景:近远雨声、滴水、风、坏招牌嗡嗡声、远雷(派 Codex,`src/systems/audio/`)
- [x] 废墟细节道具:废车、伞、传单、电线、售货机、红绿灯(Blender 脚本,派 Codex 或 Grok,`tools/blender/` + `assets/models/`)

## 阶段 2:机器人与睁眼(约 3 小时)
- [x] 残破机器人模型:Blender 脚本按部件生成,刚性挂接,缺一条手臂、外壳开裂(Claude 定规格,派 Codex 写脚本)
- [x] 机械眼装置:光圈叶片、裂纹镜片、对焦(Claude)
- [x] 睁眼交互:长按、第一次失败、GSAP 时序、伺服声(Claude)
- [x] 光束体积感 + 雨滴受光(Claude)

## 阶段 3:光锥记忆(约 3 小时)
- [x] `ctx.memory` 光锥 uniform 与 TSL 判定函数 `src/materials/memory.js`(Claude)
- [x] 双状态:招牌、卷帘门、车辆、植物(Claude)
- [x] 只存在于过去的全息体:行人、行驶的车(派 Codex)
- [x] 记忆失真:电量越低越破碎(Claude)

## 阶段 4:叙事与收尾(约 2 小时)
- [x] 剧情时序 `src/story/`:开场、唤醒、记忆片段触发、结尾
- [x] 极简 UI 与开场/结尾文字
- [x] 性能检查(中档目标 60 帧)、资源体积检查(≤15MB)
- [x] 交叉评审:Codex 审代码,Grok 看画面给第二意见
- [x] 写 `docs/HANDOFF.md` 给用户:怎么运行、做了什么、没做完什么

## 规则
- 每个阶段结束都要截图(`node tools/shot.mjs <名字>`)并本地 commit。
- 某项卡住超过 45 分钟:降级方案,记进 DECISIONS.md,继续往下。

> 13:15 全部完成。中档笔记本 60 帧未实测(本机 M4 Pro 1080p 约 65 帧,弱机器靠自适应分辨率);详细过程见 docs/REPORT.md。
