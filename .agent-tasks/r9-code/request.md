# r9-code:加时冲刺的代码检查(只读)

请审查从提交 da2aafc 的父提交到 HEAD 的改动(`git diff da2aafc^ HEAD -- src tools`),重点:
- src/engine/PostFX.js:halation / 片门抖动(aa.getTextureNode().sample)/ flicker,在 ?pfx=notraa,nodof、WebGL2 回退时是否会出错。
- src/systems/street/passing.js:新加的远处车(无新灯光、only additive 网格),首帧预热、shot 模式确定性、合并排除。
- src/systems/robot/index.js:flood 宽度区分(首次 0.72 / 最后一口气 1.35)、gobo 重绘条件、line 模式角度。
- src/story/director.js:注视阶段机位、刻度后视线锁门(lookOverride)、结尾机位;重看提示 50 秒、24 秒后允许点击重开。
- src/ui/film.js、style.css:隐藏光标(body.playing)在标题/结尾/重看时是否正确恢复。
只列真正的问题(会出错、会卡、会让体验坏掉的),按严重程度排序,每条给出文件:行号和改法。不要改文件。
