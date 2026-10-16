# 任务:光锥里"过去行驶的车"(写任务,只写代码,不要启动浏览器/Vite/Blender)

先读 AGENTS.md、docs/art-direction.md、docs/review-visual-grok-final.md。参考你写的 src/systems/ghosts/(人影):同样的"只在记忆光锥里出现"的做法。
1. 新建 `src/systems/traffic/index.js`(`export default { name: 'traffic', init, update }`):过去的街上有车开过。用 `/models/props/car.glb`(你的道具车;部件 body、door_fl、glass、wheel_*)做 4 到 6 辆"过去的车":车门是关着的版本——door_fl 在 Blender 里绕 Z 轴转开了 50°,铰链点在 Blender 坐标 (-0.825, -0.79, 0.72),对应 glTF 局部坐标 (-0.825, 0.72, 0.79),绕 glTF 的 Y 轴反向转 -50° 即为关上(可以只把 door_fl 网格几何体按这个变换烘焙一次)。
2. 路线:沿车道双向行驶(x = ±1.6,z 从 12 到 -66 循环;路口 z=-42 附近可略减速),速度 4 到 7 m/s,车距合理,不互相穿插。轮子旋转。
3. 材质:和人影一致——暗剪影 + 很弱的琥珀轮廓光,只在 `memoryMask(positionWorld)` 内可见(不透明 + 世界坐标有序抖动裁切,不用透明混合),离相机 4 米内淡出;车头两盏车灯是小的琥珀色自发光片(同样只在光锥里),车尾两盏更暗。不投影。可从 ghosts 导出的 `crowd` uniform 乘一下,让门的记忆片段期间也一起退场。
4. 性能:按部件 InstancedMesh;CPU 用 `memoryMaskCPU` 粗判,不在光锥附近的车不更新矩阵。首帧前 30 帧保持可见(在开场黑屏里预编译)。不要切换任何灯光的 visible,不要新增灯光。
5. 在 src/systems/index.js 的 SYSTEMS 数组里加入 traffic(放在 rain 之前;只改那一处 import 和数组)。
验收(静态):`npx vite build` 通过。Claude 会截图验收。
权限:写任务,只能改 src/systems/traffic/**、src/systems/index.js。不联网,不得调用付费生成。交回中文 200 字以内。
