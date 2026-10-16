# w22:霓虹招牌加层次(Grok 中期评审第 2 条)
评审:.agent-tasks/r13-midreview/result.md 第 2 条。现在招牌大小接近、笔画一样粗、排成一行等高矩形,像一整块发光字板。
要做(只改 src/systems/neon/**、assets/textures/neon/**;你写的系统):
1. 每家店加一块灯箱(白/黄底彩字的方形或圆形灯箱,亮度是灯管的 60%,探出墙面 0.35 米),和灯管字明显区分。
2. 记忆里 30% 的灯管缺一段(图集里已有 broken 通道,past 支路没用它)。
3. 招牌尺寸和高度错开(大小 3 档、高度随机 ±0.8 米、部分向街心探出 0.6–1.2 米的吊牌),相邻的在画面上互相遮挡,形成前后至少三层。
4. 保持 ≤ 15 次绘制调用;现在的 ?neon=past / ?neon=off 继续可用。
不启动浏览器/Vite/Blender。result.md 写在任务目录。Claude 截图验收(street-eye?neon=past、memory-street、flood)。截止 18:55。
