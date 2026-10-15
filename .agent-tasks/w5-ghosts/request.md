# 任务:光锥里的"过去的行人"(写任务,只写代码,不要启动浏览器/Vite/Blender)

## 背景
项目 新游戏:先读 AGENTS.md、docs/art-direction.md、docs/review-art-codex.md(你自己写的审查)。
现在的街道是空的。机器人的眼睛(琥珀色光锥)照到的地方显出过去。已有共享 TSL 工具 `src/materials/memory.js`:
- `memoryMask(P)`:世界坐标 P 处"过去"的显现程度 0..1(含光锥判定、距离衰减、世界空间颗粒边缘);
- `memoryMaskCPU(p, ctx.memory)`:CPU 版本;`amberNode()`:琥珀色;`mem`:uniform 集合。
街道布局见 `src/systems/street/index.js` 的 `LANE`(两侧人行道 x = ±(halfRoad + walk/2),z 从 14 到 -70,路口在 z=-42)。

## 要做什么
新建 `src/systems/ghosts/index.js`(`export default { name: 'ghosts', init, update }`)并在 `src/main.js` 的列表里把它加在 robot 之后(只改那一行 import 和数组)。
1. 30 到 60 个"过去的行人",沿两侧人行道和路口往返行走,少数站着等、少数撑伞、一两个小孩牵着大人。速度、身高、体型随机(固定种子)。
2. 造型:程序化的简洁人形剪影(头、躯干、手臂、腿、可选的伞),用 InstancedMesh 按部件实例化,走路用顶点着色器或每帧矩阵做简单摆动(腿和手臂前后摆、身体上下起伏)。不要细节,要的是"人影"。
3. 材质:只在光锥内可见。用 `memoryMask(positionWorld)` 控制,**不透明 + 抖动裁切**(alphaHash 或自写的有序抖动 discard),不要用透明混合(避免和雨、体积雾排序冲突)。颜色:琥珀色自发光很弱 + 少量受光,边缘有扫描线/颗粒感(世界空间,TRAA 下不拖影)。不投影,不接收阴影。
4. 光锥外完全不可见、不耗费太多:CPU 侧用 `memoryMaskCPU` 粗判,远离光锥的实例可以把 count 收缩或缩放到 0。
5. 不要碰其他系统的文件。

## 验收(静态)
`npx vite build` 必须通过;不要启动浏览器或开发服务器(沙箱会拦,会让程序崩溃弹窗)。Claude 会截图验收后反馈。

## 权限
写任务,只能改 src/systems/ghosts/**、src/main.js。不需要联网。不得调用付费生成。
## 交回
中文,250 字以内。
