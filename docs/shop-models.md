# 修理铺模型清单与验收(2026-10-18)

标准画面:`assets/generated/shop/keyart/img_43683/ai_generate_43683_2.png`(开场)、`img_43685/ai_generate_43685_2.png`(布局)。
机器人定稿:`assets/generated/shop/robot_design.png`(keyart/img_43684 第 3 张裁切)。
注意:关键画面里出现的领袖像、政治标语一律不进场景(公司展示)。

## 流程(每件)
参考图(vmc gpt-image-2.5-sunburst max,浅灰背景产品渲染)→ Tripo(先做方法对比,定方法)→ `tools/blender/render_views.py` 渲染四个角度、与参考图并排 → 苛刻的视觉代理打分挑问题 → 改(换参考图 / 重做贴图 / 重做几何 / 拆件再组合)→ 减面与贴图压缩 → 进场景摆放 → 贴地检查 + 近景截图。

## 清单(05:40 更新:全部完成并已摆进场景)
所有模型:Tripo v3.1 detailed(几何)+ v3.5 detailed PBR 贴图,方法见 docs/gen-log.md;处理 `tools/prep-shop.sh`(Blender 减面、定尺寸、原点到底部中心)+ `tools/pack-shop.sh`(KTX2:ETC1S 颜色/ORM、UASTC 法线;meshopt 几何)。
| # | 模型 | 面数 | 贴图 | 文件 | 场景里 |
|---|---|---|---|---|---|
| 1 | 机器人(整体坐姿 + 单独高精度头部,头有颈部枢轴;去粉色偏色;"上海"铬标、"人民电器"铭牌为几何体) | 约 7 万 | 头 2K、身 2K 颜色/1K 法线 | robot.glb 6.1 MB | 工作台旁,镜头眼发光 |
| 2 | 拆开的电子管收音机 | 1.5 万 | 1K | tube_radio_open.glb | 工作台上 |
| 3 | 关着的电子管收音机 | 1.5 万 | 1K | tube_radio_closed.glb | 货架、待修区 |
| 4 | 绿色搪瓷台灯 | 8 千 | 1K | desk_lamp.glb | 工作台上,驱动暖光 |
| 5 | 工作台(含台虎钳、抽屉) | 2 万 | 1K | workbench.glb | 左前 |
| 6 | 矮木凳 | 4 千 | 1K | stool.glb | 3 处(机器人自带凳子 + 2 张) |
| 7 | 显像管电视 | 1.2 万 | 1K | crt_tv.glb | 货架、凳子上、待修区(部分换色、转背面) |
| 8 | 台式电风扇 | 1.2 万 | 1K | desk_fan.glb | 货架、待修区、门口纸箱上(换色) |
| 9 | 摆钟 | 8 千 | 1K | wall_clock.glb | 后墙 |
| 10 | 零件抽屉柜 | 1 万 | 1K | parts_cabinet.glb | 右墙 |
| 11 | 铁皮工具箱 | 8 千 | 1K | toolbox.glb | 工作台前 |
| 12 | 二八自行车 | 4 万 | 512 | bicycle.glb | 门外靠右柱 |
| 13 | 暖水瓶、搪瓷杯、闹钟 | 各 5–8 千 | 512 | thermos / enamel_mug / alarm_clock | 货架前排、叠放、工作台 |
| 14 | 录音机 | 1 万 | 1K | cassette_recorder.glb | 货架(黑/银/红换色) |
| 15 | 电烙铁、放大镜 | 各 6–8 千 | 512 | soldering_iron / magnifier | 工作台上 |
| 16 | 后屋木门与门框 | 8 千 | 1K | back_door.glb | 后墙 |
| 17 | 备用机器人手臂、腿、躯干(与机器人同一设计) | 1.2–1.6 万 | 512 | spare_arm / spare_leg / spare_torso | 手臂和腿挂在右墙钩上,躯干在工作台旁 |
| 18 | 电表箱、压扁的纸箱堆(街景版做过的 Tripo 模型复用) | 1–1.1 万 | — | ../v2/meterbox / cardboard | 外墙右柱、右前角 |
| — | 房间壳体、货架、纸箱(印刷来自中台)、线缆、工具墙(扳手、三种钳子、羊角锤、锉刀、手锯、起子、铜线圈、胶布)、台面小件、抹布、扫帚 | 程序几何 | 中台贴图 | — | — |

体积:模型 22.0 MB(含备用零件与复用的 2 个)+ 房间与贴花 KTX2 7.7 MB = 29.7 MB(计划上限 30 MB);打开店铺实际网络下载 31.7 MB(含程序 1.6 MB、解码器 0.5 MB,`node tools/shop-netbytes.mjs` 实测)。重复的模型(货架上的电视、收音机、风扇、录音机、杯子、闹钟、暖瓶)用实例化绘制。
没做成的:小电视 crt_tv_small(Tripo API 余额用完,403/2010)。


## 2026-10-19 起:原始网格 + 屏幕误差分级

场景不再用上面表里的减面版本(`?nolod` 仍可看旧版)。所有模型改用 Tripo 原始文件做的分级版本,见 `docs/tripo-compare/README.md`「网页里怎么显示原始模型」。机器人换成 Studio H3.1(8K),工作台上的开盖收音机换成 CLI 生成的那台。分级文件在 `assets/models/shop/lod/<名字>/`(约 1 GB,不入库,`tools/lod-all.sh` 可从原始文件重新生成;`lod.json` 入库)。开场下载约 35 MB;走到近处会再按需下载该模型的 L0(收音机 38 MB,机器人 79 MB)。
