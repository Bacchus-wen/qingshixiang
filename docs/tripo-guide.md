# Tripo 分部件高质量建模指南(青石巷)

核对日期 2026-10-17。来源:官方文档 `developers.tripo3d.ai/en/docs/<页>.md`(各端点页、changelog、rate-limits、billing)、`/en/pricing`,以及本地客户端 `~/Desktop/游戏产线配置/tools/tripo_api.py` 和它的实现笔记。写这份文档时没有提交任何任务,也没有读密钥。标「待验证」的是文档没写清的地方,要第一次小额试跑来确认(创建时被 400 拒绝的请求不会生成任务;任务失败或取消会退还积分)。

## 1. 结论
1. **画质最高的组合(H 系列)**:`model=v3.1-20260211` + `geometry_quality=detailed`(Ultra 模式,三角面上限 200 万)+ `texture_version=v3.5-20260815` + `texture_quality=detailed` + `delight=true` + `pbr=true`。输入优先用 **multiview-to-model**(2–4 张正交视图),不要只给一张图。之前 16 个道具用的是「单图、标准贴图、face_limit=12000」,这三点正好都是低配。
2. **本地 `tripo_api.py` 现在只能走「单图 → image-to-model → 下载 GLB」一条路。** 参数白名单里没有 geometry_quality、texture_quality、texture_version、delight、generate_parts,所以第 1 条的组合目前一个参数都发不出去,要先扩展客户端(见第 5 节)。
3. 又细又密、重复排列的结构(防盗笼钢筋、卷帘门片、导轨、管线、电线、晾衣杆)交给 Blender 程序化生成。Tripo 只做有体积、有磨损、形状不规则的部件。官方博客也说过:极细的细节放进贴图,不要指望生成几何。
4. `refine` 和 `stylize` 在 v3 文档里已经标为 deprecated,不要接入。

## 2. 2026 年可用的模型版本
| 能力 | 版本 | 要点 |
|---|---|---|
| H 系列几何 | `v3.1-20260211`(最新、质量最好)、`v3.0-20250812`、`v2.5-20250123` | 面数上限:v3.1 标准 150 万,Ultra 200 万;quad 15 万;smart_low_poly 三角 500–2 万 |
| P 系列几何 | `P1-20260311`(低模,50–2 万面,拓扑干净)、`P2-20260801`(Preview;三角 48–5 万,quad 48–2.5 万) | P1 不支持 quad、smart_low_poly、generate_parts、geometry_quality |
| 贴图 | `v3.5-20260815`(最新,只有它能用 delight 和 fast)、`v3.0-20250812`(v3.x 默认)、`v2.5-20250123` | `texture_quality`:fast / standard / detailed(HD)/ extreme(8K) |
| 分割 | `v1.0-20250506`(按几何分,默认)、`v2.0-20260430`(语义分割,Beta) | v2 可选 `segmentation_granularity`、`ref_image` |
| 部件补全 | `v1.0-20250506` | `ai_completion`(默认)/ `quick_cap` |
| 重拓扑 | `v3.0`(2026-10 新增,可同时 `smart_uv`)、`v2.0`(默认)、`v1.0` | v3.0:三角 500–2 万、quad 500–1 万 |
| Smart UV | `default` | 输入不超过 8 万等效三角面 |

## 3. 三类资产的推荐做法
### (a) 硬表面街道道具(电表箱、液化气罐、冰柜、煤炉、灯箱、货摊)
- 端点:`multiview-to-model`,front、left、back、right 四张视图。
- 参数:第 1 节的组合,另加 `texture_alignment=original_image`、`export_uv=true`,并固定 `model_seed`。
- 近景件:生成时不写 `face_limit`(自适应高模),再调用 `/mesh/decimate` `{model:v3.0, face_limit:4000–12000, smart_uv:true, bake:true}`。远景件:生成时直接写 `face_limit` 3000–8000,省掉重拓扑的 35 积分。
- 不确定的选项:贴图如果跨边错位,用 `/models/texture` 改成 `texture_alignment=geometry` 重做贴图(20 积分),不要重新生成几何。

### (b) 立面模块
| 模块 | 交给 Tripo 的部件 | Blender 程序化 | 最终面数 |
|---|---|---|---|
| 阳台 + 防盗笼 | 阳台底板和栏板(水泥、瓷砖剥落)、笼顶铁皮雨棚、笼内杂物 | 方钢竖杆、横档、焊点(阵列)、晾衣杆 | 底板 6–10k,笼子 1–3k |
| 卷帘门店面 | 门头招牌框或灯箱、卷帘箱、两侧贴瓷砖的门柱 | 卷帘片(单片阵列 + 法线起伏)、导轨、地锁 | 8–15k |
| 屋顶水箱 | 不锈钢或铁皮水箱本体 | 角钢支架、进出水管 | 4–8k |
| 空调群 | 单台外机(现有 v2-prop-acunit 可按高配重做一次) | L 形支架、冷凝管、缠带铜管,摆放用实例化 | 每台 2–4k |
- 墙挂件只给 front、left、right 三张视图,省略 back(front 必须有,总数至少 2 张)。参考图只画部件本身,不画墙。
- 形状简单的部件(水箱、箱体)可以用 `P1-20260311`(face_limit 2000–5000),或在 H 系列上开 `smart_low_poly=true`(+10 积分)得到干净低模。官方提醒:smart_low_poly 只适合简单输入,复杂输入可能失败。

### (c) 车辆(废弃老轿车 / 记忆里亮着车灯的车)
- 车身:用 `multiview-to-model` 四视图(侧视图信息量最大),参数同 (a)。注意重拓扑三角面上限只有 2 万,所以近景车生成时直接写 `face_limit=40000`,远景车走 decimate v3.0 到 12000。
- 轮子单独生成一个(front 用轮胎侧面),在 Blender 里复制 4 个,这样圆度更好。
- 车窗、车灯在 Blender 里换材质:玻璃改成透明/透射,车灯改成自发光。Tripo 会把玻璃烘成不透明贴图。
- 如果想从整车里拆出部件:`/mesh/smartsegment`(seg_type=image,85 积分,一步完成建模和分割),或 `/mesh/segment` v2,配 hint 或 ref_image。

## 4. 分部件流程
**第 0 步 拆件清单**:建 `assets/generated/parts/<资产>/parts.json`,每个部件写:名字、来源(tripo / procedural / existing)、真实尺寸(米)、视图集合、面数预算、材质备注。每个 Tripo 部件都要写明用途(项目规则)。

**第 1 步 参考图**(每个 Tripo 部件一套)
- 做法 A(推荐):用 vmc 出一张四视图转台图,front、left、back、right 横排在同一张图里;纯灰背景,平光无投影,正交无透视,四个视图同比例且居中。然后用 Python(PIL)等宽切成 4 张 PNG,补边成正方形,边长至少 1024。四个视图从同一张图里出,风格和比例最一致。vmc 生图前按它的技能规则确认模型和参数。
- 做法 B:vmc 出一张高质量 3/4 视角图 → Tripo `image-to-multiview`(10 积分)生成四视图 → 不对的视图用 `edit-multiview` 修(每张 5 积分)→ `multiview-to-model` 直接传 `[{"task_id":…}]`。
- 画面要求:单个部件、完整、无遮挡、无文字水印;锈迹和磨损要画进去(贴图会继承)。`delight` 只能去掉一部分烘焙光照,所以打光要平。
- **禁止**使用 Tripo 的 `chat_image_*` 生图模型:它们是 OpenAI 图像生成,本项目不允许。如果要用 Tripo 自带的生图,只用 seedream_v5 或 gemini。

**第 2 步 每个部件调 Tripo**
- 有 2–4 张视图用 `multiview-to-model`;只有一张图用 `image-to-model`(可开 `enable_image_autofix`)。
- 迭代省钱法:先只出几何(`texture=false, pbr=false, geometry_quality=detailed`,共 40 积分),在 Blender 里看形状;满意后再调 `/models/texture`(`input=task_id`,并重新提供四视图,HD 档 20 积分)。总价和一次出贴图相同,但形状不行时能少扔掉贴图那部分积分。
- 几何定下来以后,只换 `texture_seed` 或只重做贴图,不要重跑几何。

**第 3 步 分割与补全**(可选,只在「一个整体模型需要拆开」时用)
- 生成时加 `generate_parts=true`(+20 积分)可以直接得到可编辑的分件,但必须 `texture=false, pbr=false`,而且不能带 quad 或 smart_low_poly(否则返回 1004 或不出分件)。之后用 `/models/texture` 上贴图。贴图后分件是否还在:待验证。
- 已有带贴图的模型:`/mesh/segment`(v2,granularity 用 detailed;想精确控制可以给一张色块分割图作 ref_image)→ `/mesh/complete`(`ai_completion`,用 `part_names` 只补被遮挡的部件)→ 补出来的面没有原贴图,要用 `/models/texture` 带 `part_names` 重贴(待验证)。
- `part_names` 应该来自分割结果 GLB 里的节点名。文档没有直接列出,待验证:下载后在 Blender 里读 object 名。

**第 4 步 Web 规格**(three.js WebGPU,首屏不超过 15MB)
| 类别 | 最终三角面 | 贴图(base / ORM / normal) |
|---|---|---|
| 小道具 | 2k–6k | 1024 |
| 中件、立面模块 | 6k–15k | 1024–2048 |
| 近景车、主角件 | 15k–40k | 2048 |
- 用 detailed(HD)档生成,在本地缩到 1–2K。实测 standard 档输出 2048 的 Color、ORM、NormalGL;detailed 的实际尺寸文档没写。extreme(8K)只给极近景件,而且 GLB 可能逼近客户端 150MB 的下载上限。
- 不要用 `compress=geometry`(meshopt:本地 validate_glb 会拒收,项目也禁止顶点量化)。不要用 `quad=true`(强制输出 FBX,本地只收 GLB)。不要用 `export_orientation`(官方说会让后续处理朝向出错,方向在 Blender 里改)。
- 缩贴图:`~/Tools/bin/gltf-transform resize in.glb out.glb --width 1024 --height 1024`;最后跑 `tools/optimize-assets.sh`。

**第 5 步 Blender 无界面组装**(新脚本 `tools/blender/assemble_module.py -- --manifest parts.json --out assets/models/v3/<名>.glb`)
1. `read_factory_settings(use_empty=True)`,逐个导入部件 GLB,应用变换。
2. 按 `normalize_prop.py` 的算法,把原点放到包围盒底部中心,再缩放到 parts.json 里的真实尺寸。不用 auto_size,保证结果确定。
3. 按 manifest 的 loc/rot 摆放部件。墙面模块统一约定:原点在墙面底边中点,+Y 朝街。
4. 生成程序化部件:钢筋用方管或圆管阵列;卷帘用单片阵列;管线用曲线挤出。
5. 部件之间互相插入 1–2 cm,避免漏缝;接缝处用包边、焊点、锈迹贴花遮住。
6. 同材质部件 join 成一个(减少 draw call),统一命名为 `part_<名>`,需要时再加 Decimate 修饰器补减面,缩小贴图。
7. 导出 GLB(`export_apply=True`、JPEG 88),最后 `os._exit(0)`。
8. 预览渲染截图,确认后才进场景。重复的模块(空调、阳台)在 three.js 里用 InstancedMesh 铺,统一的湿润和污渍 TSL 层把各部件色调拉到一起。

## 5. 本地 tripo_api.py 的支持情况与扩展
| 功能 | 端点 | 本地支持 |
|---|---|---|
| 上传图片 PNG/JPEG | `POST /files`(multipart 字段 `file`) | 支持(`upload_image`) |
| 上传模型 GLB(≤150MB) | 同一端点,同样的 `file` 字段 | 不支持(只校验并上传图片) |
| 大文件上传 | `POST /files/presign` `{"format":"glb"}` → 无认证 PUT 到 `presigned_url` | 不支持 |
| 单图建模 | `POST /generation/image-to-model` | 支持(参数受限,见下) |
| 查询与下载 | `GET /tasks/{id}` | 支持,但只读 `output.model_url`,且只收 GLB |
| 多视图建模、图转多视图、编辑多视图、贴图、分割、智能分割、补全、重拓扑、Smart UV、转换 | 见下 | 都不支持 |

- 已支持的参数:`texture, pbr, face_limit, model_seed, texture_seed, export_uv, auto_size, enable_image_autofix`。已支持的模型:v3.1、v3.0、P1、P2。默认是 `texture=false, pbr=false`。
- image-to-model 需要加进白名单的参数:`geometry_quality, texture_quality, texture_version, delight, texture_alignment, orientation, generate_parts, smart_low_poly`。`quad`、`compress`、`export_orientation` 保持拒收。
- 要加的校验规则:
  - generate_parts 必须同时有 `texture=false, pbr=false`,且不能有 quad 或 smart_low_poly。
  - `texture_quality=fast` 必须配 `texture_version=v3.5-20260815`。
  - geometry_quality 只能用于 H 系列 v3.x,P1 不能用。
  - face_limit 上限:Ultra 模式 200 万;smart_low_poly 时 500–2 万。
- 代码结构要改的地方:
  - 输出字段按端点区分:image-to-multiview 返回 `front_view_url`、`left_view_url`、`back_view_url`、`right_view_url`;smartsegment 返回 `seg_model_url`、`mask_url`;Smart UV 返回 `uv_render_url`。
  - 指纹改成 `endpoint + 规范化 body + 上游 task_id + 源文件哈希`,manifest 里记录上游 task_id。
  - 继续保持「POST 不自动重提」。
  - 新端点返回的下载域名如果不是 `tripo-data.rg1.data.tripo3d.com`,要先观察到实际域名,再按精确主机名加进白名单。

各端点的请求体(POST,`Content-Type: application/json`,基址 `https://openapi.tripo3d.ai/v3`):
```jsonc
// /generation/image-to-model(扩展后的高配)
{"input":"file_A","model":"v3.1-20260211","geometry_quality":"detailed","texture":true,"pbr":true,"texture_version":"v3.5-20260815","texture_quality":"detailed","delight":true,"texture_alignment":"original_image","export_uv":true,"model_seed":101}
// /generation/multiview-to-model:inputs 用 view-key 写法;其余字段同上。只出几何时 texture/pbr 设为 false
{"inputs":[{"front":"file_F"},{"left":"file_L"},{"back":"file_B"},{"right":"file_R"}],"model":"v3.1-20260211","geometry_quality":"detailed","texture":true,"pbr":true,"texture_version":"v3.5-20260815","texture_quality":"detailed","delight":true}
{"inputs":[{"task_id":"<image-to-multiview 任务 id>"}],"model":"v3.1-20260211","geometry_quality":"detailed","texture":false,"pbr":false,"generate_parts":true}
// /generation/image-to-multiview(10 积分)和 /generation/edit-multiview(每张 5 积分)
{"input":"file_A"}
{"input":"<multiview task_id>","prompts":[{"view":"back","prompt":"add rust streaks, keep shape"}]}
// /models/texture:images 必须正好 4 张,顺序 [front,left,back,right];text、image、images 三选一
{"input":"<task_id 或 GLB file_token>","model":"v3.5-20260815","texture_prompt":{"images":["file_F","file_L","file_B","file_R"]},"texture_quality":"detailed","pbr":true,"delight":true,"texture_alignment":"original_image","bake":true,"part_names":["body"]}
// /mesh/segment(v2,语义分割);或者给 ref_image 分割色块图
{"input":"<task_id>","model":"v2.0-20260430","segmentation_granularity":"detailed","split_by_connectivity":true}
{"input":"<task_id>","model":"v2.0-20260430","ref_image":"file_MASK"}
// /mesh/complete:input 必须是 segment 任务的 id
{"input":"<segment task_id>","completion_mode":"ai_completion","part_names":["wheel"]}
// /mesh/smartsegment:image 管线先建模再分割;model 管线只收 GLB,且必须给 4x4 列主序 transform
{"seg_type":"image","input":"file_A","granularity":"fine","hint":"old sedan: body, wheels, windows, headlights"}
{"seg_type":"model","input":"file_GLB","transform":[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],"granularity":"medium"}
// /mesh/decimate(v3.0;smart_uv 只能用于 v3.0)和 /mesh/uv(Smart UV)
{"input":"<task_id>","model":"v3.0","face_limit":8000,"smart_uv":true,"bake":true}
{"input":"<task_id>","bake":true}
// /models/convert:一般不需要,Blender 能处理;任何非默认参数都按 advanced 档 10 积分计费
{"input":"<task_id>","format":"GLTF","texture_size":1024,"texture_format":"JPEG","pivot_to_center_bottom":true}
```
- `texture_prompt.image` 和 `images` 的元素格式文档只写了「file_token 或 URL」。style_image 的示例是 `{"url":…}`,官方 Go SDK 用的又是另一套扁平字段 `text_prompt`、`image_prompt`,两边对不上。建议先试字符串写法;如果返回 400/1004,改成 `[{"file_token":"…"}]`。待验证。
- `/mesh/edit`(P2 局部重做,用 bbox 指定区域)在文档站的代码里存在,但导航和 llms.txt 都没有列出,视为未公开,暂不接入。

## 6. 积分(1 积分 = 0.01 美元;失败或取消会退还)
| 项目 | 积分 |
|---|---|
| H 系列单图或多视图建模:无贴图 / 标准贴图 | 20 / 30 |
| 叠加:HD 贴图 / 8K 贴图 / HD 几何 | +10 / +20 / +20 |
| 叠加:quad / smart_low_poly / generate_parts | +5 / +10 / +20 |
| P1:无贴图 / 标准贴图;P2:无贴图 / 标准贴图 | 40 / 50;100 / 110 |
| 贴图任务:fast、standard / HD / 8K | 10 / 20 / 30 |
| 分割 / AI 补全 / quick_cap 补全 | 40 / 50 / 30 |
| 智能分割:image / model | 85 / 55 |
| 重拓扑:v3.0 三角 / v3.0 四边 / v2.0 / v1.0 | 35 / 40 / 30 / 10 |
| Smart UV / 格式转换(基础 / 进阶) | 20 / 5 / 10 |
| 图转多视图 / 编辑多视图(每张) | 10 / 5 |
- 实测:2026-10-10 一次 image-to-model(标准贴图 + PBR)扣了 30 积分。
- 估算:一个高配硬表面部件 30 + 10 + 20 = **60 积分**;加图转多视图 +10,加重拓扑 +35,最多约 105。整条「分割 + 补全 + 重贴」再加 110。一个阳台模块(3 个 Tripo 部件)大约 180–300 积分。
- 并发按账户和类别分别计算:H 系列 10、P 系列 5(另一页写的是 3)、图片生成 1、模型处理(贴图 / 转换)5、网格操作 10。超出时返回 429,错误码 2000,按 `Retry-After` 等待。

## 7. 待验证清单(先各跑一个最小样例)
1. texture_prompt 里 images 元素的格式。
2. generate_parts 的输出结构,以及贴图后分件是否还在。
3. decimate 的 bake 是否会把高模细节烘成法线。
4. part_names 从哪里读取。
5. detailed / extreme 档贴图的实际尺寸。
6. 新端点的下载域名。
7. task_id 作为下游输入能保留多久(文档没写):链式任务要连续做完,每一步都落地并记下哈希。下载链接大约 5 分钟失效,成功后要立刻下载。
