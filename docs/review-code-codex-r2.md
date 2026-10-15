已静态审查全部指定文件，并核对本地 three.js 0.186.1 源码；未联网、修改或运行项目。以下性能排序是代码判断，非实测。

**致命**

未确认必现的启动崩溃或着色器编译错误；指定文件未发现反向 `smoothstep`。

**重要**

- [robot/index.js:84](/Users/wenbin/Games/新游戏/src/systems/robot/index.js:84)、[director.js:54](/Users/wenbin/Games/新游戏/src/story/director.js:54)：第一次持续长按，0.9 秒后目标永久为零，必须松开重按才进入下一阶段，但提示始终只有“按住”。失败后改提示为“松开，再按住”；短点也会增加 attempts，应在有效长按后才计次。
- [Input.js:6](/Users/wenbin/Games/新游戏/src/engine/Input.js:6)：无 blur、visibilitychange、pointercancel 清理；按住后切窗可能丢失释放事件，回来仍自动开眼耗电。清空键盘/指针状态，并暂停失焦期间剧情。
- [street/index.js:125](/Users/wenbin/Games/新游戏/src/systems/street/index.js:125)：照射30秒会累积30秒 hold，离开后需50秒才归零，卷帘长期不落。改为固定离光宽限计时。另外当前顺序 street→robot→director，使卷帘读上一帧光锥、材质读当前帧；拆成导演指令→机器人→消费者→统一同步。
- [director.js:73](/Users/wenbin/Games/新游戏/src/story/director.js:73)、[robot/index.js:132](/Users/wenbin/Games/新游戏/src/systems/robot/index.js:132)：`powerOverride` 无读取者，机器人 power 却按尝试次数计算，与导演电量脱节。统一电量来源。[director.js:30](/Users/wenbin/Games/新游戏/src/story/director.js:30) 重入阶段也不清强制开眼、黑幕、结束卡或电量；增加明确的进入/退出及整局重置逻辑。
- [surface.js:39](/Users/wenbin/Games/新游戏/src/materials/surface.js:39)：+Y 面 UV 为 xz，B 却指向−Z；+X 面 U 为+Z，T 却为−Z。法线贴图扰动与纹理方向镜像。让 UV 符号与 T/B 一致；世界 xz 涟漪应直接转换为世界方向。
- [PostFX.js:48](/Users/wenbin/Games/新游戏/src/engine/PostFX.js:48)：WebGL2 仍无条件建立半浮点目标，缺少浮点颜色附件能力时会失败；独立 MRT 混合还依赖 `OES_draw_buffers_indexed`，本地 `WebGLState.js:295` 明确降级为统一混合。初始化时检测能力，提供普通颜色单通道路径；不能仅凭 backend 名称认定回退成功。

**可优化——60帧目标最优先五处**

1. [PostFX.js:48](/Users/wenbin/Games/新游戏/src/engine/PostFX.js:48)：`depthPass` 只选择深度输出，未替换材质，仍重复绘制原材质。改真正深度材质，保留幽灵的 discard 规则。
2. [PostFX.js:80](/Users/wenbin/Games/新游戏/src/engine/PostFX.js:80)：`reflectNonMetals:true` 禁用了零遮罩提前剔除；墙面仍追踪后才乘零。已有 refl 充当 metalness，改 false；低档先降 SSR，保留用于体积稳定的 TRAA。
3. [street/index.js:102](/Users/wenbin/Games/新游戏/src/systems/street/index.js:102)、[props.js:44](/Users/wenbin/Games/新游戏/src/systems/street/props.js:44)：逐窗独立 Mesh、道具深克隆不合批。窗口/重复道具实例化，静态立面按材质合并。
4. [details.js:98](/Users/wenbin/Games/新游戏/src/systems/street/details.js:98)、[robot/index.js:65](/Users/wenbin/Games/新游戏/src/systems/robot/index.js:65)：三盏投影灯为1024²、512²、1024²；大量细件全部投影。远灯禁阴影、限制投影对象，眼闭时停更新，动态遮挡变化时再刷新。
5. [atmo/index.js:36](/Users/wenbin/Games/新游戏/src/systems/atmo/index.js:36)：三个体积默认各18步，每步两次3D采样及灯光计算；眼闭时零密度仍绘制。隐藏零密度体积，低档8步并考虑半分辨率。

次要：[robot/index.js:103](/Users/wenbin/Games/新游戏/src/systems/robot/index.js:103) 每帧创建8个轴向量，112行再 clone；复用临时量。[film.js:20](/Users/wenbin/Games/新游戏/src/ui/film.js:20) 定时器无清理，重建会累积；保存句柄并 dispose。