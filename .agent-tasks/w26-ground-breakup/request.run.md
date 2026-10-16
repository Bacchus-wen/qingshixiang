【说明】你在项目的一份独立副本里工作，当前目录就是项目根目录。只在当前目录内读写，路径一律用相对路径。任务结束后，系统会核对你的改动并把声明范围内的部分带回原项目。node_modules、dist、.godot 这类构建或缓存目录里的改动，只有任务声明的路径点名了它们才会带回。

# w26(辅助):湿路面质感——粗糙度碎裂、积水水位、路沿流水
按 docs/cybercity-digest.md 第 6 节做,只改 src/materials/ground.js、src/materials/wet.js、src/materials/ground.test.mjs。
- groundRoad:微粗糙度碎裂 rough×mix(0.75,1.25,fbm(P·1.9));半干区 wetness×(1-smoothstep(0.35,0.7,fbm(P·0.06))·0.3)。
- 积水水位加"离路沿距离"项(LANE.halfRoad 处 +0.25)和路拱减项;积水粗糙度 0.03→0.015,积水内法线拉平、反照率×0.5。
- 路沿 0.3 m 宽流水带:rippleNormal 加沿 z 的滚动偏移。
- 注意:现在路面 emissiveNode 里有 neonLightAt()(Claude 加的,WebGPU 下增益为 0,WebGL 回退时用),保留。
- 不改其他文件。不启动浏览器/Vite/Blender。result.md 写在任务目录,写清 Claude 截图验收用的镜头(street-low、street-eye?neon=past)。
