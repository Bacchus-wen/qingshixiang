# 只读评审:英文版的文字和排版,第 1 轮

背景:用户说"做成英文版"。同一份代码两种语言:`?lang=en` 或 `?lang=zh`,不带参数时跟浏览器语言走;标题页左上角有切换链接。只翻译对观众说的话,街景里的中文招牌、告示和"拆"保留(它们是场景)。代码:`src/ui/i18n.js`、`src/systems/shop/story.js`、`src/ui/film.js`、`src/ui/style.css`、`src/main.js`、`src/engine/Engine.js`、`src/systems/shop/index.js`(模型检视模式)、`tools/build-pages.mjs`(英文出处页 credits-en.html)。

中英对照(请重点看英文是否自然、准确、语气统一):
- 标题:青 石 巷 → Bluestone Lane(英文标题由我定,用户可以改)
- 请戴上耳机 → Best with headphones
- 点击画面开始 → Click to begin(触屏:Tap to begin)
- 店里的每一件旧物都由 Tripo 生成 · 素材出处与许可见 credits.html → Every old thing in the shop was generated with Tripo · sources and licences: credits-en.html
- 片尾:它记得这条街亮着灯的样子。 → It remembers the street with its lights on.
- 点击画面重看 → Click to watch again(触屏:Tap to watch again)
- 按住鼠标左键 → Hold the left mouse button(触屏:按住屏幕 → Press and hold the screen)
- 再按住一次 → Hold it again;松开，再按住 → Let go, then hold again
- 保持按住，移动鼠标 → Keep holding, move the mouse(触屏:Keep holding, slide your finger)
- 移动鼠标，让它看看街对面 → Move the mouse to let it look across the street(触屏:Slide your finger to let it look across the street)
- 出错:This browser cannot run WebGPU or WebGL2 / Please open it in the latest Chrome, Edge or Safari / Please reload the page (details in the browser console) / Core systems failed to start: …
- 模型检视:Robot · generated with Tripo · 1.83 M triangles raw; up close the raw mesh shows;提示 Drag to orbit · right-drag to pan · scroll to zoom · double-click a model for a close look · keys 1–8 for views;模型名见 `src/systems/shop/index.js` 的 NAMES。
- 出处页标题:Bluestone Lane · Sources and licences(内容见 `tools/build-pages.mjs` 里 credits-en.html 的模板)

排版:英文改用西文衬线字体(Iowan Old Style / Palatino / Georgia),字距按单词设(中文的 0.6–0.9em 大字距会把单词拉散);标题全大写加字距;手机上提示可以换行,署名行居中不超出屏幕。

看图:`docs/english/overview.jpg`(英文标题、中文标题、两条提示、第二幕提示、手机)。

请回答:
1. 英文有没有不自然、不准确或语气不统一的地方?给出建议改法。
2. 英文标题 Bluestone Lane 合不合适?
3. 排版有没有问题(字体、字距、大小写、手机换行)?
4. 有没有漏翻、对观众可见的中文界面文字?

交回格式:第一行写 `总评 X/10`,然后逐条结论。中文写结论,英文改法直接给英文。500 字以内,直接在回复里。

权限:只读,不联网,不调用付费生成,不启动浏览器、Blender、Vite 或长时间进程,不改文件。
