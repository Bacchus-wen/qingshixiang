# w30(辅助):记忆里的人穿上真衣服(VAT 重新烘焙带 UV + cybercity 服装贴图)
现在记忆里的人是 src/systems/ghosts/vat.js 的 VAT 人群(你之前用 src/systems/ghosts/bake-crowd.mjs 从 reference/cybercity/assets/models/crowd/male.glb、female.glb 烘焙,assets/models/crowd/*.vat,manifest.json 里 format 是 indices + positions + normals,**没有 UV**),材质是 src/systems/ghosts/life.js 的 silhouette(纯色深衣服 + 细霓虹边),看起来像纯色人偶。
要做(可写 src/systems/ghosts/**、assets/models/crowd/**、assets/textures/crowd/**):
1. 重新烘焙时带上 UV(和每个服装用到的材质/贴图对应关系);贴图来自 reference/cybercity/assets/textures/crowd/(raincoat、trench、hoodie、casualsuit 的 diffuse/normal、头发、鞋、皮肤),转成 jpg、最长边 ≤ 1024,放到 assets/textures/crowd/,总增量 ≤ 6 MB。
2. 材质改成真实受光的 MeshStandardNodeMaterial(贴图颜色,雨夜里略压暗 0.7,粗糙度 0.6;雨衣类 0.35 带湿感),保留 lifeMask 的 maskNode(只在记忆/洪流里出现)和很细的霓虹边光(life.js 现在的 rim 系数 0.9 降到 0.35)。伞保留现有做法。
3. 绘制调用尽量不增加(每种服装一个批次 + 贴图合成一张图集最好);性能注意。
4. 保持 nearFade、路线(routes.js)、crowd uniform(门的那段要淡出)不变。
不启动浏览器/Vite/Blender。result.md 写在任务目录(**不要写到项目根目录**,上次因此被判越界)。
