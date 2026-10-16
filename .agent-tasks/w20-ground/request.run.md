【说明】你在项目的一份独立副本里工作，当前目录就是项目根目录。只在当前目录内读写，路径一律用相对路径。任务结束后，系统会核对你的改动并把声明范围内的部分带回原项目。node_modules、dist、.godot 这类构建或缓存目录里的改动，只有任务声明的路径点名了它们才会带回。

# w20:地面升级(用 cybercity 的地面贴图)

第二版要提高精细度。现在路面和人行道是程序化的(src/materials/surface.js + wet.js)。cybercity 有一整套高质量地面贴图:
`reference/cybercity/assets/textures/ground/`(asphalt_a/b、sidewalk_tiles、stone_pavers、concrete、manhole、drain_grate、paint_wear、litter_atlas 等,_c 是颜色,_n 是法线)和做法 `reference/cybercity/src/systems/ground/`(surfaces.js、roadMaterial.js)。用户已授权内部展示使用。

要做:
1. 把路面(M.road)和人行道(M.walk)的材质换成贴图版本:沥青(带修补、磨损的标线 paint_wear)、人行道方砖;保留并叠加我们的湿润系统(wet.js:变暗、水膜、积水、涟漪法线、只有朝上光滑的面才进 SSR 遮罩——见 src/engine/PostFX.js 的 metalrough MRT b 通道约定)。积水的位置不要变(水洼是剧情画面的一部分)。
2. 井盖、排水篦子、散落垃圾(litter_atlas)作为贴花/小平面放在路上(数量适中,合批)。
3. 贴图转换到 `assets/textures/cc/ground/`:jpg 质量 88,最长边 ≤ 2048,增量 ≤ 6MB(可复用 src/systems/street/convert-cc.sh 的写法)。
4. 新代码放在 `src/materials/ground.js`(或 src/materials/ 下新文件)。**不要改 src/systems/street/ 下的任何文件**(Claude 正在改);在 result.md 里写清楚 street/index.js 里需要改哪一两行来接上(例如 `M.road = groundRoad(ctx)`),Claude 来接。
5. 调试参数 `?oldground` 切回旧地面。CREDITS.md 记下用到的贴图(可写)。

可写:`src/materials/**`、`assets/textures/cc/ground/**`、`CREDITS.md`。不启动浏览器、Vite、Blender。result.md 写在任务目录。
