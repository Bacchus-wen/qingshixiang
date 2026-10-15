# 任务:Blender 道具包脚本(写任务,只写代码,不要运行 Blender)

## 背景
项目 新游戏:先读 AGENTS.md(尤其"进程安全"和沙箱规则)、docs/art-direction.md。银盐风格:所有材质无彩色(只用灰度 base color、粗糙度、金属度)。街道是程序化的,现在的废车、售货机等是方块占位(见 src/systems/street/details.js)。
**你在沙箱里不能启动 Blender**,只写脚本;Claude 会在沙箱外运行并把渲染结果反馈给你。

## 要做什么
写 `tools/blender/props.py`,用法:
`/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P tools/blender/props.py -- --out assets/models/props`
脚本用 bpy 程序化建模(可用修改器:Bevel、Solidify、Array、Boolean、Displace,几何节点也可),为每个道具导出一个 glb(应用修改器,+Y 朝上,单位米,原点在底部中心):
1. `car.glb`:废弃的老式紧凑轿车(4.2m 长),驾驶座车门打开约 50°,两个轮胎瘪了(车身略倾斜),挡风玻璃碎裂(玻璃单独一个材质,带裂纹可用凹凸贴图或几何碎片),车顶有积水凹坑感。部件命名:body、door_fl、glass、wheel_*。
2. `vending.glb`:自动售货机(0.9×0.75×1.85m),前面板(名为 panel,之后会做发光)、按钮列、取货口、侧面凹痕。
3. `umbrella_broken.glb`:翻过来躺在地上的长柄伞,伞骨断了两根,伞布塌陷;另一个 `umbrella_open.glb`:撑开但伞面破洞,斜靠。
4. `ac_unit.glb`:空调外机(带格栅、风扇、支架)。
5. `debris.glb`:几件散落杂物合在一个文件里但各自命名:压扁的纸箱、塑料筐、自行车轮、一摞湿透的传单。
6. `lamp_head.glb`:老式路灯灯头(灯罩 + 灯管,灯管名为 bulb)。
7. `traffic_light.glb`:红绿灯灯箱(三个灯名为 lamp_r、lamp_y、lamp_g)。
要求:
- 每个文件 < 400KB,合计 < 2.5MB;三角面合计 < 60k。
- 材质名有意义(paint、rubber、glass、metal_dark、plastic、paper),只用 Principled BSDF 的数值,不要贴图(之后在 three.js 里加湿润层)。
- 脚本可重复运行,结果确定(固定随机种子)。脚本最后 `sys.stdout.flush(); os._exit(0)`(避免 Blender 退出时崩溃弹窗)。
- 另写 `tools/blender/render_props.py`:把 assets/models/props/*.glb 排成一排,Eevee 渲染一张 1600×900 的检查图到 renders/props_sheet.png(三点光,中灰背景)。同样结尾 os._exit(0)。

## 验收
不要运行 Blender。用 `python3 -m py_compile` 检查语法,并在交回里写清楚预期输出。Claude 会运行并把截图反馈给你。

## 权限
写任务,只能改 tools/blender/props.py、tools/blender/render_props.py。不需要联网。不得调用付费生成。
## 交回
中文,300 字以内。
