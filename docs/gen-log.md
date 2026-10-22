# 生成记录(修理铺,2026-10-18 起)

预算:中台图片 ≤150 张(gpt-image-2.5-sunburst / max),Tripo API ≤2800 积分。中台只生成与下载到本地,不转存、不分享。

## 01:30 关键画面(8 张)
- S1 开场 ×2(2048×1152):Cinematic film still, looking under a half-open rolling steel shutter into a small closed-down home appliance repair shop in an old Chinese street at dusk, 1990s China. Inside, a warm green enamel desk lamp lights a cluttered wooden workbench with a half-disassembled vintage tube radio, a soldering iron, a magnifying glass and a white enamel mug. Steel shelves up to the ceiling are crowded with old CRT televisions, tube radios, desk fans, alarm clocks and cassette players, each with a handwritten paper tag. A pegboard wall of tools, a terrazzo floor, green-painted lower walls and yellowed upper walls, a paper calendar and a pendulum wall clock beside a wooden back door with a pale door frame. A small handmade robot assistant built from old appliance parts sits slumped on a low stool beside the bench, covered in dust, still holding a screwdriver. Cold blue dusk light from the street spills under the shutter, dust floating in the lamp light, quiet and nostalgic, realistic materials, shot on 35mm film, shallow depth of field, photorealistic.
- S2 机器人(旧家电拼的帮手)×4(1536×1024):Cinematic photorealistic character portrait of a small handmade robot assistant built by an old Chinese repairman from salvaged 1980s home appliance parts: its head is the wooden casing of a vintage tube radio with a single old camera lens as its eye, its torso is a dented sheet-metal chassis with an exposed desk-fan motor and coiled cables, its arms and legs are made of pipes, brass water taps as joints and springs, its hands hold a screwdriver. It sits slumped on a low wooden stool beside a cluttered repair workbench under a warm green enamel desk lamp, covered in dust, the lens faintly glowing amber. Shelves of old radios and televisions softly blurred behind it. Lovingly crafted, believable engineering, worn paint, rust and scratches, tender and lonely mood, shot on 35mm film, shallow depth of field.
- S5 等距布局 ×2(1536×1024):Isometric cutaway 3D diorama of a small old Chinese home appliance repair shop from the 1990s, one room on a square base like a miniature model, front wall removed. Steel shelves full of vintage tube radios, CRT televisions, desk fans and clocks on the left wall; a pegboard tool wall and a drawer cabinet on the right wall; a wooden workbench with a green enamel desk lamp and a disassembled radio in the middle; a small dusty robot made of old appliance parts sitting on a stool beside the bench; a wooden back door with a pale frame and pencil height marks on the back wall; a half-open rolling shutter at the front with an old black bicycle parked outside; terrazzo floor, green-painted lower walls. Warm lamp light and cool dusk light, clear readable layout, highly detailed realistic 3D render.

## 02:20 第一批参考图(13 张,1024² 或 2048²,max,不透明浅灰背景)
机器人设计定稿:keyart/img_43684 第 3 张(复制为 assets/generated/shop/robot_design.png),机器人各件以它为参考图(--ref)。
- robot_full:A highly detailed photorealistic product render of the small handmade robot assistant from the reference image, built from salvaged 1980s Chinese home appliance parts: a vintage wooden tube radio casing as its head with a speaker grille and a single old camera lens as its eye, a dented sheet-metal chassis torso with an exposed desk-fan motor and coiled cables, pipe arms and legs with brass water-tap joints and coil springs, chunky worn boots, sitting upright on a low wooden stool with its hands resting on its knees, the stool included. Three-quarter front view from slightly above, the entire object fully in frame with generous margin, isolated on a plain light grey seamless studio background, soft even studio lighting, no cast shadows, no text, no logos, no people, sharp focus, realistic worn materials.
- robot_head:A highly detailed photorealistic product render of only the head of the robot from the reference image: a vintage wooden tube radio casing as its head with a speaker grille and a single old camera lens as its eye, a dented sheet-metal chassis torso with an exposed desk-fan motor and coiled cables, pipe arms and legs with brass water-tap joints and coil springs, chunky worn boots — just the radio-casing head with its camera-lens eye and a short neck of braided cables, nothing else. Three-quarter front view from slightly above, the entire object fully in frame with generous margin, isolated on a plain light grey seamless studio background, soft even studio lighting, no cast shadows, no text, no logos, no people, sharp focus, realistic worn materials.
- robot_torso:A highly detailed photorealistic product render of only the torso of the robot from the reference image: a dented sheet-metal chassis box with an exposed desk-fan motor, ventilation louvres, rivets, coiled cables and pipe stubs at the shoulders and hips, no head, no arms, no legs. Three-quarter front view from slightly above, the entire object fully in frame with generous margin, isolated on a plain light grey seamless studio background, soft even studio lighting, no cast shadows, no text, no logos, no people, sharp focus, realistic worn materials.
- robot_arm:A highly detailed photorealistic product render of one arm of the robot from the reference image: a pipe upper arm, a brass water-tap elbow joint, a pipe forearm wrapped with cables, and a mechanical three-finger gripper hand. Three-quarter front view from slightly above, the entire object fully in frame with generous margin, isolated on a plain light grey seamless studio background, soft even studio lighting, no cast shadows, no text, no logos, no people, sharp focus, realistic worn materials.
- robot_leg:A highly detailed photorealistic product render of one leg of the robot from the reference image: a pipe thigh, a coil-spring knee, a pipe shin and a chunky worn boot-shaped foot. Three-quarter front view from slightly above, the entire object fully in frame with generous margin, isolated on a plain light grey seamless studio background, soft even studio lighting, no cast shadows, no text, no logos, no people, sharp focus, realistic worn materials.
- tube_radio_open:A highly detailed photorealistic product render of a 1970s Chinese wooden tube radio opened up for repair: the back panel removed showing glowing-free vacuum tubes, a metal chassis, capacitors, a speaker and dangling wires, cloth speaker grille and dial on the front. Three-quarter front view from slightly above, the entire object fully in frame with generous margin, isolated on a plain light grey seamless studio background, soft even studio lighting, no cast shadows, no text, no logos, no people, sharp focus, realistic worn materials.
- tube_radio_sheet:A product turnaround sheet in a 2x2 grid of the same 1970s Chinese wooden tube radio opened up for repair (back panel removed showing vacuum tubes, metal chassis, capacitors, speaker and wires; cloth grille and tuning dial on the front): top-left front view, top-right left side view, bottom-left back view, bottom-right right side view; orthographic, identical scale and centering in each cell, plain light grey background, soft even studio lighting, no shadows, no text, photorealistic.
- desk_lamp:A highly detailed photorealistic product render of a 1970s Chinese green enamel adjustable desk lamp with a heavy round cast-iron base, a jointed metal arm with springs and a deep green enamel shade with chipped edges, a fabric power cord. Three-quarter front view from slightly above, the entire object fully in frame with generous margin, isolated on a plain light grey seamless studio background, soft even studio lighting, no cast shadows, no text, no logos, no people, sharp focus, realistic worn materials.
- workbench:A highly detailed photorealistic product render of an old wooden repairman's workbench from a 1980s Chinese repair shop, a heavy scarred wooden top with burn marks and a small cast-iron bench vise, two banks of drawers with brass handles, worn green paint on the legs. Three-quarter front view from slightly above, the entire object fully in frame with generous margin, isolated on a plain light grey seamless studio background, soft even studio lighting, no cast shadows, no text, no logos, no people, sharp focus, realistic worn materials.
- stool:A highly detailed photorealistic product render of a low square wooden stool from 1980s China, worn varnish, scuffed edges, four slightly splayed legs with stretchers. Three-quarter front view from slightly above, the entire object fully in frame with generous margin, isolated on a plain light grey seamless studio background, soft even studio lighting, no cast shadows, no text, no logos, no people, sharp focus, realistic worn materials.
- crt_tv:A highly detailed photorealistic product render of a 1980s Chinese 14-inch CRT television with a wood-grain plastic cabinet, rotary channel knobs, a speaker grille and a V-shaped rabbit-ear antenna on top, dusty screen. Three-quarter front view from slightly above, the entire object fully in frame with generous margin, isolated on a plain light grey seamless studio background, soft even studio lighting, no cast shadows, no text, no logos, no people, sharp focus, realistic worn materials.
- desk_fan:A highly detailed photorealistic product render of a 1980s Chinese desk fan with a pale green enamel motor housing, a round chrome wire cage, four metal blades and a round base with push buttons. Three-quarter front view from slightly above, the entire object fully in frame with generous margin, isolated on a plain light grey seamless studio background, soft even studio lighting, no cast shadows, no text, no logos, no people, sharp focus, realistic worn materials.
- wall_clock:A highly detailed photorealistic product render of an old Chinese pendulum wall clock in a dark wooden case with a glass door, a white dial with numbers and a brass pendulum. Three-quarter front view from slightly above, the entire object fully in frame with generous margin, isolated on a plain light grey seamless studio background, soft even studio lighting, no cast shadows, no text, no logos, no people, sharp focus, realistic worn materials.

## 02:45 第二批参考图(14 张,1024²,max)
模板:A highly detailed photorealistic product render of {obj}. Three-quarter front view from slightly above, the entire object fully in frame with generous margin, isolated on a plain light grey seamless studio background, soft even studio lighting, no cast shadows, no text, no logos, no people, sharp focus, realistic worn materials.
- parts_cabinet:an old grey-green steel parts drawer cabinet from a 1980s Chinese repair shop, four columns of small pull-out drawers with brass label holders and handles, chipped paint, dents and rust at the base
- toolbox:a worn dark green steel cantilever toolbox from 1980s China with a folding handle, chipped paint, dents and rusty latches, closed
- bicycle:an old black Chinese 28-inch roadster bicycle like a Flying Pigeon, rod brakes, a rear rack, a chain guard, a bell and a worn leather saddle, slightly rusty chrome, seen from the side at a slight angle
- thermos:an old Chinese vacuum thermos flask with a painted tin body decorated with red peony flowers, a cork stopper and a pale blue cap, scratched and dented
- enamel_mug:a white chipped enamel mug with a blue rim and a lid, from 1980s China, plain without text
- alarm_clock:an old Chinese twin-bell mechanical alarm clock with a chrome case, two bells on top, a white dial and luminous hands, slightly tarnished
- cassette_recorder:a 1980s portable stereo cassette recorder boombox in silver and black plastic with two round speaker grilles, a cassette door, piano-key buttons and a carrying handle, scratched and dusty
- soldering_iron:an old soldering iron resting in a coiled wire stand on a small cast-iron base with a damp sponge tray, a fabric power cord
- magnifier:an old desk magnifying glass on a heavy cast-iron base with an adjustable arm and a round glass lens in a brass rim
- back_door:an old Chinese interior wooden door with a frosted glass upper panel and a brass handle, set in a pale worn painted wooden door frame with a threshold, dark varnished wood with scratches, the door closed
- tube_radio_closed:a 1970s Chinese wooden tube radio with a cloth speaker grille, a horizontal tuning dial with Chinese station markings removed, three bakelite knobs and a row of piano-key buttons, worn veneer
- crt_tv_small:a small 1980s Chinese 9-inch black-and-white portable CRT television in cream plastic with a carrying handle, rotary knobs and a telescopic antenna
- cardboard_boxes:a stack of three old worn cardboard appliance boxes of different sizes, tied with string, faded printing, torn corners
- pegboard_tools:a wall-mounted wooden pegboard with old hand tools hanging on hooks: screwdrivers, pliers, wire cutters, wrenches, a hammer and coils of wire, seen from the front at a slight angle

## 02:40–03:10 Tripo(API,tools/tripo4.py)
- 方法对比(电子管收音机):M1 单图建模、M2 单图→多视图→建模、M3 自制四视图拼图→建模;各约 60–70 积分。
- 机器人:整体坐姿(robot_full)与分件(head、torso、arm、leg)均为 M2。
- 道具第二批(M2):desk_lamp、workbench、stool、crt_tv、desk_fan、wall_clock。
- 道具第三批(M2):parts_cabinet、toolbox、bicycle、thermos、enamel_mug、alarm_clock、cassette_recorder、soldering_iron、magnifier、back_door、tube_radio_closed、crt_tv_small。
- 参数:model v3.1-20260211、geometry_quality detailed、texture v3.5-20260815 detailed、PBR、delight。

## 03:00 Tripo API 余额用完
- 账户查询 /v3/account/balance:balance 0.00。本次按账本估算用了约 1730 积分(25 个任务 × 60–70)。
- 已完成 23 个模型(机器人整体/头/躯干/手臂/腿、收音机 ×3 种方法、台灯、工作台、木凳、电视、风扇、摆钟、零件柜、工具箱、自行车、暖水瓶、搪瓷杯、闹钟、录音机、电烙铁、放大镜、后屋门、关着的收音机)。
- 未完成:小电视 crt_tv_small(提交时 403/2010,余额不足)。之后的模型重做只能等充值或改用其它来源;Blender 内的减面、贴图、组合与摆放照常进行。

## 03:15 房间材质与平面贴图(12 张,max)
- wall_upper(1024x1024):Seamless tileable texture, perfectly flat orthographic view with no perspective and no lighting gradient, old yellowed lime-washed interior plaster wall from a 1990s Chinese shop, faint water stains, hairline cracks, small scuffs and fingerprints, subtle variation, even soft lighting, no objects, no text, high detail photographic material.
- wall_dado(1024x1024):Seamless tileable texture, perfectly flat orthographic view with no perspective and no lighting gradient, old dark green gloss oil-painted wall dado from a 1990s Chinese shop, small chipped spots showing pale plaster, scuffs, faint drips, slightly uneven sheen, even soft lighting, no objects, no text, high detail photographic material.
- floor_terrazzo(1024x1024):Seamless tileable texture, perfectly flat orthographic view with no perspective and no lighting gradient, top-down worn 1990s Chinese terrazzo floor, small white, grey, black and reddish stone chips set in grey cement, dirt and dust, faint scuffs, even soft lighting, no objects, no text, high detail photographic material.
- ceiling(1024x1024):Seamless tileable texture, perfectly flat orthographic view with no perspective and no lighting gradient, old whitewashed concrete ceiling, grey water stains and small peeling patches, even soft lighting, no objects, no text, high detail photographic material.
- pegboard(1536x1024):Perfectly flat orthographic front view filling the entire frame edge to edge, no perspective, no background, no shadows, even lighting, photographic: a wall-mounted brown pegboard covered with old hand tools hanging on hooks: screwdrivers with red and yellow handles, pliers, wire cutters, wrenches, a hammer, coils of copper wire and a test meter, a cluttered repairman's tool wall
- calendar(1024x1536):Perfectly flat orthographic front view filling the entire frame edge to edge, no perspective, no background, no shadows, even lighting, photographic: a 1993 Chinese paper wall calendar page, a traditional landscape painting of mountains and a river on the top half, a month date grid with Chinese numerals below, slightly yellowed paper with curled corners
- price_list(1024x1536):Perfectly flat orthographic front view filling the entire frame edge to edge, no perspective, no background, no shadows, even lighting, photographic: a handwritten price list on yellowed paper for a small Chinese appliance repair shop, a red brush-written title 修理价目 and lines listing 收音机 电视机 电风扇 录音机 with prices in yuan, a pushpin at the top
- sign_main(2048x1024):Perfectly flat orthographic front view filling the entire frame edge to edge, no perspective, no background, no shadows, even lighting, photographic: a weathered horizontal shop sign board with the red painted Chinese characters 家电维修 on a pale cream background, rust streaks and peeling paint
- sign_side(1024x2048):Perfectly flat orthographic front view filling the entire frame edge to edge, no perspective, no background, no shadows, even lighting, photographic: a weathered tall vertical white sign board with red painted Chinese text listing services 收音机 电视机 电风扇 录音机 各种家电, peeling paint and rust streaks
- poster(1024x1536):Perfectly flat orthographic front view filling the entire frame edge to edge, no perspective, no background, no shadows, even lighting, photographic: an old 1980s Chinese advertising poster for a radio brand showing a happy family listening to a wooden tube radio at home, faded colors, torn corners, no slogans
- box_a(1024x1024):Perfectly flat orthographic front view filling the entire frame edge to edge, no perspective, no background, no shadows, even lighting, photographic: the side of an old worn brown cardboard appliance box with faded red printed Chinese brand text and a simple television icon, torn corners and tape
- box_b(1024x1024):Perfectly flat orthographic front view filling the entire frame edge to edge, no perspective, no background, no shadows, even lighting, photographic: the side of an old worn brown cardboard box for an electric fan with faded blue printed Chinese text and a fan illustration, water stains

## 03:30 第二批平面贴图(6 张,gpt-image-2.5-sunburst,max;中台批次 b_20261017192947)
- tags(1536x1024,img_43725):Perfectly flat orthographic top-down view filling the entire frame, a neat 4 columns by 3 rows grid of twelve small separate hand-written paper shelf tags on a plain dark grey background, each tag is a slightly yellowed rectangular card with a tiny torn corner, written with black marker pen in casual Chinese handwriting, two lines per tag: row 1: '长虹 C372', '熊猫 B-802', '红灯 711', '牡丹 TC-483'; row 2: '春兰 电风扇', '美多 28A', '凯歌 4K11', '红梅 L-610'; row 3: '上海 J212', '华生 FS-40', '待修', '已修好 取件'. Each tag clearly separated with equal gaps, even soft lighting, no shadows, photographic, realistic paper texture.
- slogan(1536x1024,img_43726):Perfectly flat orthographic front view filling the entire frame edge to edge, no perspective, no background, even lighting, photographic: an old hand-painted wooden sign board from a 1990s Chinese appliance repair shop, cream paint on wood with a thin dark brown frame, red and black brush calligraphy reading '修好一台电器 多一份信任' in two lines, worn edges, small paint chips, faded and slightly dirty.
- facade(1024x1024,img_43727):Seamless tileable texture, perfectly flat orthographic view with no perspective and no lighting gradient, weathered exterior wall of an old Chinese street shop: grey cement render with dark vertical rain grime streaks, patches of peeled whitewash, hairline cracks, faint traces of old torn paper notices, even soft lighting, no objects, no text, high detail photographic material.
- pavement(1024x1024,img_43728):Seamless tileable texture, perfectly flat orthographic top-down view with no perspective and no lighting gradient, old worn concrete pavement of a Chinese back street: square cast concrete slabs about 50 cm with dark joints, cracks, oil stains, embedded grit, slightly damp, even soft lighting, no objects, no text, high detail photographic material.
- shutter(1024x1024,img_43729):Seamless tileable texture, perfectly flat orthographic front view with no perspective and no lighting gradient, an old rolling steel shop shutter, horizontal corrugated slats painted grey-blue, heavy rust streaks and flaking paint, dents, dirt, even soft lighting, no objects, no text, high detail photographic material.
- cardboard(1024x1024,img_43730):Seamless tileable texture, perfectly flat orthographic view with no perspective and no lighting gradient, plain old brown corrugated cardboard surface from a storage box, scuffs, water stains, faded areas, a strip of old yellowed packing tape crossing it, even soft lighting, no printing, no text, high detail photographic material.
- 处理:四张可平铺贴图(墙/墙裙/地面/天花)+外立面+纸箱用 tools/blender/tex_prep.py 做"错位羽化"消接缝;全部经 tools/tex-ktx2.sh 转 KTX2(粗糙平铺与图片 ETC1S,地面与带字的 UASTC+zstd),按左下原点编码。
- 机器人贴图调色:tools/blender/robot_grade.py(粉/铜偏色去饱和,机身锈色降到 60%),不重新生成。

## 05:45 对面街景(1 张,gpt-image-2.5-sunburst,max;批次 b_20261017214316)
- street_backdrop(1536x1024,img_43736):Realistic photograph, straight-on frontal view across a narrow old Chinese street in a demolition district at dusk, blue hour: the opposite side of the street is a continuous row of weathered two-storey brick and plaster shophouses with closed rusty rolling shutters, a few small warm-lit windows upstairs, peeling posters, a big red character 拆 in a circle painted on one wall, tangled overhead electric wires and a concrete power pole, a few old bicycles leaning on the walls, deep blue evening sky with a faint orange glow low on the horizon, no people, no cars, wide shot, the ground line at the very bottom of the frame.
## 04:30 机器人徽章(2 张)与墙面第二批(3 张,营业执照未使用:带国徽)
- 见 assets/generated/shop/badges、wall2 的 manifest;提示词同目录 manifest 原文。

## 06:00 门口立牌(1 张);批次 b_20261017215417
- img_43737:Perfectly flat orthographic front view filling the entire frame edge to edge, no perspective, no background, even lighting, photographic: one face of an old hand-painted wooden sandwich-board sign standing at a Chinese repair shop entrance, dark grey-green weathered paint, two lines of white brush calligraphy reading 修不好 / 不收费, chipped edges, chalk smudges, water stains.
## 06:15 纸箱印刷第二批(2 张);批次 b_20261017221318
- img_43738:Perfectly flat orthographic front view filling the entire frame edge to edge, no perspective, no background, no shadows, even lighting, photographic: the side of an old worn brown corrugated cardboard box for a 1980s Chinese transistor radio, faded green printed Chinese brand text 红灯牌 and the words 晶体管收音机, a simple radio line drawing, a model number, torn corner, old tape, stains.
- img_43739:Perfectly flat orthographic front view filling the entire frame edge to edge, no perspective, no background, no shadows, even lighting, photographic: the side of an old worn brown corrugated cardboard box for a 1980s Chinese double-cassette tape recorder, faded black and orange printed Chinese text 燕舞 and the words 双卡收录机, a line drawing of a boombox, handling marks, scuffs, water stains.

## 06:25 身高刻度(1 张);批次 b_20261017222257
- img_43740:Perfectly flat orthographic front view filling the entire frame edge to edge, no perspective, no background, even lighting, photographic: a strip of old off-white painted plaster wall beside a door frame, covered with a child's height marks drawn in pencil and ballpoint over the years: short horizontal lines, each with small handwritten Chinese notes and dates such as 爸爸 170, 我 1993.6.1, 弟弟 1990, 弟弟 1991, 弟弟 1992, faded and smudged, some marks in red pen, a few scuffs and fingerprints, realistic texture.
## 06:50 竖排"家电维修"招牌(1 张);批次 b_20261017224203
- img_43741:Perfectly flat orthographic front view, no perspective, even lighting, photographic: a tall narrow weathered vertical shop sign board of an old Chinese appliance repair shop, painted cream white on wood with a thin dark border, four large red brush-painted Chinese characters 家 电 维 修 stacked vertically one under another filling the board, rust stains and peeling paint, the narrow sign stands centered in the frame and fills the full height of the image, plain dark grey background on both sides.
## 07:00 左侧留空的洞洞板(1 张);批次 b_20261017225415
- img_43742:Perfectly flat orthographic front view filling the entire frame edge to edge, no perspective, no background, no shadows, even lighting, photographic: a wall-mounted old brown pegboard in a repairman's workshop. The LEFT 40 percent of the board is EMPTY: only bare pegboard holes and a few empty wire hooks, no tools at all. The right 60 percent has old hand tools hanging on hooks: pliers with red handles, wire cutters, a row of spanners, a hammer, a coil of copper wire, a small analog multimeter, a roll of black insulating tape. Worn, dusty, slightly greasy.

## 2026-10-19 14:10 对街"现在 / 从前"两张(第五版:看外面;用户确认:gpt-image-2.5-sunburst、max、3840x2160、不透明、各 2 张挑 1)
- 现在 ×2(任务 img_43864,文生图;选第 1 张 → `assets/generated/shop/tex_ready/street_now.png`,裁掉下方 240 px 的马路):Straight-on, eye-level elevation photograph of the far side of a narrow old street in a small southern Chinese town at dusk, present day, the facades square to the camera with almost no perspective convergence. A continuous row of five or six three-storey shophouses from the 1980s: grey and cream plaster, small white wall tiles, rusted window grilles and narrow balconies. The block is about to be demolished: every ground-floor shop has its rolled-steel shutter pulled down, rusted and dented; the red character 拆 is painted inside a hand-drawn circle on three of the walls; the upper windows are dark, several broken or boarded up; one building near the middle is already half torn down, leaving a heap of broken bricks and an exposed inner wall with faded green paint and a strip of old wallpaper; slack electric wires sag across the facades; two or three old shop signs remain, faded and unlit; one bare tree; bricks, torn plastic sheeting and debris along the pavement. No people, no vehicles. Cold blue dusk, the sky darkening, a faint orange afterglow low on the horizon, no lights on anywhere. Quiet and desolate. Photorealistic documentary photograph, natural colour, crisp detail. The pavement takes only the bottom tenth of the frame. No logos, no watermarks, no captions.
- 从前 ×2(任务 img_43868,图生图,参考图 = 选中的"现在";选第 1 张 → `street_then.png`,同样裁切):The same street, the same row of buildings and exactly the same framing, camera position and horizon as the reference image, but on a warm summer evening in the mid-1990s, before any demolition: every building is complete, including the one that is torn down in the reference; no 拆 characters, no rubble, no broken windows. The ground-floor shops are open and lit from inside with warm tungsten light spilling onto the pavement: a noodle shop with steam rising from a big pot at the door, a grocery with goods stacked outside, a barber with a striped pole, a small electronics and video shop with a glowing television in the window, a tailor; small lit light-box signs with short Chinese shop names; warm light in most upper windows, laundry hanging on bamboo poles from the balconies, potted plants; bicycles parked along the pavement; a few neighbours as soft, slightly motion-blurred figures without clear faces, sitting on low stools outside and chatting. Deep blue twilight sky. Lively, warm and nostalgic. Photorealistic documentary photograph, natural colour, crisp detail. The pavement takes only the bottom tenth of the frame. No logos, no watermarks, no captions.
- 配额 0 → 4 张(当日 300),只下载到 `assets/generated/vmc/`,没有转存或分享。KTX2(ETC1S)由 `tools/tex-ktx2.sh` 生成。

## 2026-10-21 电视重新生成(Tripo 开放平台 API,用户批准,上限 160 积分)
- 输入图:`assets/generated/shop/refs/crt_tv.png`,和原模型相同。模型 v3.1-20260211,精细几何,高清 PBR(贴图 v3.5-20260815、detailed、去光照)。
- `crt_tv_v2a`:先生成四视角(10 积分),检查合格;"右"那张是右前斜视角,原来那组也是这样,看来是 Tripo 的约定。再由四视角建模(60 积分)。
- `crt_tv_v2s`:单图直接建模(60 积分),作对照。
- 共 130 积分。
- 盲评(Codex,只看 `docs/tripo-compare/blind-tv/`):
  - 原模型 Q 30 分:各角度最均衡,背面最像电视。
  - 单图 P 29 分:正面旧化最好,背面是一块平板。
  - 四视角 R 28 分:背面凸起像木方。
  - 三个版本的刻度数字都有乱码。
- 怎么用:纸箱上那台(货架近景主角,只露正面)换成 P,做成 `crt_tv_hero` 一套分级细节,屏幕位置重新量过,见 `past.js` 的 `TVS`。货架上其余电视(有的背面朝外)保留原模型。R 没有使用,留在 `assets/generated/tripo4/crt_tv_v2a/`。
- 开盖收音机没有重新生成:评委说的结构问题来自参考图的设计本身,同一张图再生成也不会变。按用户的选择,只把放大镜台灯从机芯前挪到工作台左后角。

## 2026-10-21 晚:把凳子从机器人身上切下来(不花积分)
- **原因**:Tripo 把机器人和它坐的凳子生成成了一整块熔在一起的网格。转身只能整体转,凳子也跟着转。用户问"可以给机器人绑骨吗",选了"切开凳子＋给身体做关节"。
- **切分**:脚本 `tools/blender/robot_split.py`,Blender 无界面运行。
  - 输入 `assets/generated/compare/studio/robot-h3.1-8k.glb`,原文件不动。
  - 输出 `assets/generated/derived/robot-split/robot_split.glb`,里面是两个网格 `robot` 和 `stool`。
  - **凳面平面**:用凳面朝上的木头拟合,偏差 0.4 毫米。平面以下、凳子方框以内的归凳子,其余归机器人。
  - **嵌进凳面的电线**:Tripo 让平躺的电线嵌进了木头,槽最深约 3 厘米。凳面中间这层表皮整块换成一块新的平板(圆角),贴图从正上方烘焙:能看到的 85% 木头直接用,其余用凳面另一半转 180 度补。
  - **前沿**:嵌在凳面前沿的黑色电线残端删掉。
  - **切口**:两边都封上。
  - 每改一遍都渲染检查,前后做了大约十遍,见脚本开头的说明。
- **精简模型**:重新生成,`tools/lod-models.json` 里 robot 的来源改成切分后的文件。L1 20.5 万面,L2 5.7 万面,L3 2 万面。
- **关节**:在 `src/systems/shop/rig.js` 里,按顶点位置算权重,不用骨骼文件。在原来的软脖子之后依次加:
  - 腰:胸口以上整体绕脊柱扭转。
  - 弹簧小腿:左右靴子各自抬起。
  - 身体:绕凳子中心的竖轴转。
  - 转身动作 `turnPose`:分三下挪过去,每下左脚先抬、右脚后抬,上身领先,头最先转向街上。
- **第二幕位置**:转完以后,机器人比原来往门口方向挪了约 0.30 米、往右 0.12 米。第二幕的机位、脸部补光、眼睛锚点 `EYE0`、评审截图机位都平移了同样的量 (+0.12, 0, +0.30)。
- **瞄准修复**:身体转过去以后,眼睛朝向正好落在 ±180 度的分界线上。偏航差已归一化到 ±180 度以内(`eye.js`)。
- **10-21 晚,转身改成电影式**。用户看了说"动作不自然,机器人不会这样往后转"。分析过三条路:真人式整套动作、电影式剪切、腰部像转台那样转。用户选了电影式。
  - 镜头里只演身体最先做的那部分:听,然后头从右肩上方转约 85 度,肩膀跟着拧约 29 度,最后前倾要起身。剪切就落在前倾这一下(2.6 秒)。
  - 第二幕一开场,身体绕凳子转完最后 22 度,略过头再回来,坐稳(0.7 秒)。
  - 剪切那一帧,姿势、镜头和视角同时切过去;头的角度直接对准(`eye.snapLook`)。
  - 凳子刮擦声跨过剪切点,最后"咚"一声坐稳(`sound.js` 里的 `scrape`)。
  - 两只手在膝间合握着同一把螺丝刀,在生成的网格里是熔在一起的,所以手不动。腰部新增前倾。
  - 原来"分三下挪过去"的那段代码已删除。
- **10-22,改成故障转场,不再演转身**。用户指出"钢铁的身体怎么可能拉伸"。原因是腰、脖子的权重按位置平滑过渡,等于把钢做成了橡皮。用户要求"直接故障特效转场"。
  - 第一幕结尾,机器人静止在听,镜头缓推。0.62 秒和 1.02 秒各有一次预兆小故障;1.37 秒起画面撕裂,1.65 秒在最强的一帧剪到第二幕,这时它已经面朝街道;故障在 0.6 秒内退去。
  - 故障效果在 `PostFX.js` 里,由 `params.glitch` 控制,强度为 0 时画面不变。构成:条带错位、坏块、红绿蓝通道错开、扫描线、雪花带、整帧明暗跳动。声音是合成的跳频短鸣加噪声爆音。
  - 腰部扭转、前倾、弹簧抬脚、转身前后的动作全部删除。关节只保留"整个机器人绕凳子中心的刚体转动",用于第二幕的姿势。
  - 转场已发给 Codex 独立评审(`docs/judge/transition-1/`)。
- **10-22 下午,故障转场经 Codex 六轮评审(5 → 7 → 7.5 → 7.8 → 8.3 → 8.8 分),第 6 轮认为可以交付**。现在的节奏:
  - 门口镜头,机器人背对我们静听。0.50–0.72 秒眼睛的光降到 0.1 倍,中间 0.62 秒第一次小故障。0.86 秒、1.12 秒各再暗一下(0.25 倍),0.92 秒第二次小故障。1.18 秒起画面撕裂,1.28 秒在最强的一帧剪到第二幕。
  - 剪后是匹配镜头:头在画面里的位置和大小与剪前一致,光束落在对街的新興電器上。停 1.04 秒,再用 1.6 秒移到第二幕主机位。故障在 0.24 秒内退去。视线停在新興電器上,直到观众移动鼠标。
  - 眼睛的光变暗时,它照亮的那台电视同步变暗:0.1 倍时屏幕熄灭,0.25 倍时画面缩成一条亮线。第 4、5 轮说的"地面冷光"就是这台电视的光(`past.js` 的 `tvLight`),不是机器人补光。补光改回常量。
  - 剧情系统在眼睛系统之后更新。剪切那一帧会让眼睛按新姿势再算一遍(`eye.sync`),否则这一帧街对面还是现在的卷帘门。
  - 评审记录在 `.agent-tasks/judge-transition-{1..6}/result.md`,截图在 `docs/judge/transition-{1..6}/`。

## 2026-10-22 晚:对街"新興電器"做成三维(不花积分)
- **原因**:历次评委都说对街像一张巨幅照片,比三维主角还精彩。用户 10-21 选了"对街关键店铺做成三维",10-22 说"继续"。
- **做法**(`src/systems/shop/farshop.js`):照片里这家店的橱窗挖空,后面搭一间三维小店;货架和柜台上是修理铺已有的 Tripo 模型;现在态是照片里的卷帘门;招牌是立体灯箱,门口有台阶;橱窗前的一家三口按照片手工描轮廓(本机没有抠图工具),站在路沿上;自带光照,不加新灯。没有生成新图或新模型。
- **配套**:`lod.js` 的模型副本可以带自己的材质版本(`look`);`past.js` 可以给别处放的电视加屏幕(`addTV`),对街电视不发出换台声,也不抢修理铺的电视补光;路沿碎砖只属于现在,光束里消失。
- **评审**:Codex 三轮 7 → 7.5 → 8 分,第 3 轮认为可以作为这一阶段的成品。汇总见 `docs/judge/farshop-review.md`。
- **开销**:每帧多约 12.5 万个三角面(看得见的那段货架才摆模型)。

