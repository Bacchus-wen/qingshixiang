# 任务:一只猫(写任务,只写代码,不要运行 Blender/浏览器/Vite)

先读 AGENTS.md、docs/art-direction.md、docs/concept-ruin.md 第 7 节("肩上可能停着一只鸟或者趴着一只猫(它在这里很久了)")、docs/REPORT.md 当前状态。
空城里唯一的活物:一只瘦猫,蜷在机器人脚边。
1. `tools/blender/cat.py`(无界面 Blender 5.2,结尾 sys.stdout.flush(); os._exit(0)):程序化建模一只低多边形但轮廓真实的猫(< 4k 三角面),刚性分件、带枢轴:body、head、ear_l、ear_r、tail_0..tail_4(尾巴分段)、leg_fl、leg_fr、leg_bl、leg_br。湿漉漉的灰黑毛色(灰度 Principled,略高光)。导出 assets/models/cat.glb,原点在身体下方地面,朝 +Y(Blender -Y)为前。另导出同一只猫的"蜷睡"姿态不需要单独文件——姿态在 three.js 里用分件旋转完成。
2. `src/systems/cat/index.js`(`export default { name: 'cat', init, update }`):
   - 位置:机器人(ctx.api.robot.root,世界坐标约 x=-4.58,z=-13.5,坐在人行道上,面朝 +X)右脚边、靠墙,人行道高度 y=0.14。
   - 状态:sleep(蜷着,身体呼吸起伏,尾巴偶尔动一下)→ 当 ctx.memory.strength > 0.3 时 alert(慢慢抬头,朝向光束方向 ctx.memory.dir,耳朵转动)→ 闪电时(ctx.world.lightning > 0.5)耳朵一抖、身体一缩 → 当 ctx.api.director?.phase === 'end' 时起身,沿人行道朝 -Z 方向慢慢走开,4 到 6 秒后走出画面(简单步态:四条腿交替摆动、身体轻微起伏、尾巴上扬)。
   - 材质:按 glb 材质名生成 MeshStandardNodeMaterial(灰度),上表面加湿润高光(可参考 src/systems/robot/materials.js 的 wetRough 写法)。castShadow/receiveShadow = true。
   - 加载失败时安静退出,不能崩。
   - 不要每帧 new 对象;不要切换任何灯光的 visible。
3. 在 src/main.js 的系统列表里把 cat 加在 robot 之后(只改那一处 import 和数组)。
验收(静态):`python3 -m py_compile tools/blender/cat.py`、`npx vite build` 通过。Claude 会运行 Blender 并截图。
权限:写任务,只能改 tools/blender/cat.py、src/systems/cat/**、src/main.js。不联网,不得调用付费生成。交回中文 200 字以内。
