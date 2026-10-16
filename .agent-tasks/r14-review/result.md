上一轮意见和这轮截图、参考视频我先对照着看，只做画面评审，不改游戏代码。截图里人和车的颜色、离地关系跟参考差很多。我抽参考帧，并核对人群、车灯和机器人相关参数，好把改法落到具体文件。对照已经够用。人和记忆里的车在画面上是整块霓虹，车和机器人都离地。我把这三条和能改的参数写进任务目录。# r14 第三轮画面评审

看了 x-cyber 的 8 秒、22 秒、40 秒、55 秒，以及 snap-v3-flood、snap-v3-memory-street、snap-playthrough（按画面，不按格子上的标签）、snap-v2-robot-close。

洪流帧里街不再是空的：有撑伞的人、有车、有灯管和 24H 灯箱，雾也退了。下面只说还差的，和这轮新出来的错。

## 1. 和参考比，现在最大的三处

**1. 人和记忆里的车全身是招牌色。**

看到：flood 和 memory-street 里，人、伞、品红轿车朝向镜头的面和轮廓一样亮，整块是品红、青绿或绿。旁边那辆白面包车是现在的车，才有车身。x-cyber 8 秒、40 秒、55 秒里，人是深色衣服，伞是深色布，只有外沿吃到招牌；车是深漆和玻璃，灯是一小块暖白或红。

改 `src/systems/ghosts/life.js` 的 `silhouette()`。现在 `lights([])` 配合 `normalView`，朝向镜头的面也被涂满。换成世界空间法线，并去掉那层底色：

```js
const V = normalize(cameraPosition.sub(positionWorld));
const rim = pow(float(1).sub(abs(dot(normalWorld, V))), 10.0);
material.colorNode = vec3(0.02);
material.emissiveNode = tint.mul(rim);
```

车身走的是同一个函数（`src/systems/traffic/index.js` 里亮度 0.3），不用另写材质。灯片保持暖白强度 6、尾灯强度 3。改完用 flood 这张机位看：胸口和车门应该是黑的，只有肩、伞沿和车边是色。若整身还是亮的，说明 `normalWorld` 在 `lights([])` 下也是空的，同一处删掉 `lights([])` 再看一次。

**2. 路不倒影，记忆里的车悬在路面上。**

看到：flood 的地面是碎石噪点，车底下是一块红椭圆，招牌颜色没有拉成一条倒影。x-cyber 8 秒和 55 秒的柏油能映出整条街，轮胎泡在水里。品红轿车四个轮子和路面之间有一条透空的缝，memory-street 里同一辆也悬着。

三处一起改：

- `src/systems/traffic/index.js` 的 `poseCar`：y 从 `0` 改成 `-0.22`。路面顶在 y=0（`src/systems/street/index.js` 路盒中心 -0.02、厚 0.04），轮毂在局部 y=0.325，轮胎底现在碰不到地。
- 同文件光池：`poolMaterial.colorNode` 的 `.mul(.35)` 改成 `.mul(0.08)`。那块红椭圆不要盖住路面。
- `src/materials/ground.js` 的 `groundRoad`：法线 `xy.mul(0.42)` 改成 `xy.mul(0.12)`；干燥粗糙度 `mix(float(0.9), float(0.72), …)` 改成 `mix(float(0.55), float(0.42), …)`；`coverage: 0.55` 改成 `0.8`。积水粗糙度会落到 0.03，现在是石子法线把倒影打碎。

**3. 睁眼之后大部分时间是白手电打在灰墙上。**

看到：接触表里多帧是一个硬边白圆打在灰立面上，门口是一块纯白，雨是灰线。洪流那一帧已经有霓虹密度。x-cyber 全程是两侧招牌叠到灭点，店内是暖的，门框还在。

三处数字：

- `src/systems/robot/index.js` 第 267 行 `this.spot.intensity = 140 * o * o` 改成 `48 * o * o`。颜色 `(1.0, 0.84, 0.7)` 留着。
- `src/story/fragment.js` 门灯 `porchGlow).mul(6)` 改成 `.mul(1.8)`。
- `src/engine/PostFX.js` 的 `exposure: uniform(1.3)` 改成 `uniform(1.05)`。

先改人和车的材质，再把车落到地上，然后把聚光从 140 降到 48。招牌和雾这轮可以先不动。

## 2. 新出现的明显错误

有四件。静帧里没有定格住的闪烁。人身高约 1.6，和门的比例站得住，没有头身错位。

- 漂浮，车：上面第 2 条。flood 和 memory-street 都有，轮子和路面之间能看见一条缝。
- 漂浮，机器人：接触表的侧面里，它坐在人行道上方，脚和小腿不沾地，身下是一块发紫的椭圆。水坑网格是 `makePuddle()`，`colorNode` 是 `vec3(0.012)`，紫不是材质色，是打在这块圆片上的光或倒影。根位置 `ROBOT_POS.y = LANE.curb`（0.14），和人行道顶齐，网格原点不在脚底。把 y 改成 `LANE.curb - 0.4`，用这张侧面机位看脚是否落地。
- 穿插：接触表有一帧近处冒出一块纯绿平板，横在路面上，对不上伞，也对不上一块车顶。人和车改暗之后如果还在，查那一帧相机前的 life 网格。
- 过曝：门口在接触表里仍是纯白，用上面的门灯和曝光就能压下去。`docs/snap-v2-robot-close.png` 是 15:57 的旧文件，这轮骨架改完没有新的近景。就这张旧图，瞳孔仍是裁死的白斑，镜圈没有，胸口破口是黑窟窿，污渍是圆斑。新的侧面能看见一点躯干结构，近景没更新，不能算骨架已经入镜。若新近景里眼睛还爆，把 `src/systems/robot/materials.js` 里 `eye_core` 的 `eyeGlow.mul(eyeGlow).mul(7)` 改成 `.mul(1.2)`。