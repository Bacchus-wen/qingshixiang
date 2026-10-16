# w18:霓虹招牌层(第二版画面的第二块核心)

方向见 docs/PLAN-v2.md:**现在**暗但看得清,只有零星残存、坏掉、闪烁的霓虹;**记忆(光锥里)**是参考视频一(reference/x-cyber.mp4、reference/cybercity 的 signage 系统)那样满街的彩色霓虹。中国南方老街,1990–2000 年代:粤语/普通话混用的招牌。

## 要做:新系统 `src/systems/neon/`(在 `src/systems/index.js` 里注册,放在 rain 之前)
1. 读 `reference/cybercity/src/systems/signage/`(atlas.js、library.js、street.js、billboards.js)学它的做法:Canvas 贴图集 + 少量合批网格 + 发光。
2. 数据来源:`ctx.api.street.facades`(每栋楼 { side, z, w, h, frontX, shop, home, signName })和 `ctx.api.signs`。不要改 street 的文件。
3. 每栋楼 2–4 块:竖向挑出的灯箱招牌(4–9 米高,垂直于墙面伸向街心)、横向霓虹灯管字、二楼以上的小灯箱、个别屋顶大招牌。内容是中文店名/行业:歌舞厅、卡拉OK、录像厅、网吧、发廊、士多、粥粉面、凉茶、药房、旅社、桌球、电器维修、五金、海鲜酒家……可夹少量繁体和英文。
4. 视觉:灯管描边 + 外发光(Canvas 里用 shadowBlur 画辉光层,或 TSL 里做),底板是深色塑料/铁框;颜色:品红、青、绿、黄、红、紫、暖白。
5. 两种状态(用 `memoryMask(positionWorld)`,来自 `src/materials/memory.js`):
   - **现在**:全街只有 6–10 块还亮,颜色降饱和、偏暗;一部分缺笔画(灯管坏了一段)、偶尔闪烁(确定性伪随机,截图模式下稳定)。其余是不亮的脏灯箱,能看出字的轮廓。
   - **记忆**:光锥照到的招牌全部点亮、饱和、完整,不闪。
6. 地面彩色光斑:每块亮着的招牌下方地面一块加法混合的彩色光晕(不要新建 THREE 灯光——运行中改灯光数量会重编译所有材质),湿地面的屏幕空间反射会把招牌倒映出来。光晕同样分现在/记忆两种强度。
7. 性能:全部招牌合成 ≤ 15 次绘制调用(贴图集 + InstancedMesh 或合并几何),不要每块一个材质。
8. 调试参数:`?neon=past` 全部按记忆点亮,`?neon=off` 关闭整个层。

## 范围与规则
- 可写:`src/systems/neon/**`、`src/systems/index.js`、`assets/textures/neon/**`。不要碰 street、robot。
- 不启动浏览器、Vite、Blender;Claude 截图验收(`node tools/shot.mjs memory-street --frames 360`、`flood`、`street-eye`)。
- result.md 写清楚做了什么、参数、担心的地方。**result.md 写在任务目录里**(上次写到了项目根目录,被判越界)。
