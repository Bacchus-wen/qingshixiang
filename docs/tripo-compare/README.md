# Tripo 生成方式对比(2026-10-18)

同一张输入图(`assets/generated/shop/refs/tube_radio_open.png`、`robot_full.png`),不同路线生成,原始模型不做任何处理。

**看对比**:http://127.0.0.1:5181/compare.html (开发版 http://127.0.0.1:5173/compare.html)。两个模型重叠摆在同一位置,拖中间的分割条左右对比;上方切换收音机/机器人,左右两个下拉框各选一个版本;"线框"看网格疏密。模型统一转成正面朝前、最长边 1 米、底部贴地,所以比例不同的模型在分割线两侧会对不齐,这是模型本身的差别。

| 物件 | 版本 | 三角面 | 贴图 | 文件 | 花费 | 用时 |
|---|---|---|---|---|---|---|
| 收音机 | API(v3.1、几何/贴图 detailed、PBR) | 190 万 | 4K ×3 | 65 MB | 60 积分(开放平台,任务记录) | 3 分 18 秒 |
| 收音机 | CLI(同上设置) | 190 万 | 4K ×3 | 71 MB | 约 55 积分(Studio 账号,余额推算) | 3 分 13 秒 |
| 收音机 | Studio H3.1 | 10.5 万 | 颜色 8K + 4K ×2 | 28 MB | — | — |
| 收音机 | Studio P2.0 | 5.1 万 | 颜色 8K | 24 MB | — | — |
| 收音机 | Studio H3.1 分部件 | 191 万(49 个部件) | 49 张,最大 8K | 85 MB | — | — |
| 收音机 | API 早先一次(贴图 v3.5 + 去光照) | 190 万 | 4K ×3 | 64 MB | 约 60 积分 | — |
| 机器人 | API | 197 万 | 4K ×3 | 68 MB | 60 积分 | 3 分 07 秒 |
| 机器人 | CLI | 196 万 | 4K ×3 | 70 MB | 约 55 积分 | 3 分 16 秒 |
| 机器人 | Studio H3.1 | 187 万 | 颜色 8K + 4K ×2 | 79 MB | — | — |
| 机器人 | Studio P2.0(四边面) | 5.1 万 | 颜色 8K | 17 MB | — | — |

要点:
- API 和 CLI 设置相同、几何几乎一样;差别在材质:CLI 金属更亮、颜色更浓,收音机里的电子管是透明玻璃管(更接近输入图),API 的更像金属罐。各生成一次,差别里混着随机性。
- CLI 登录的是 Studio 账号,和 Studio 扣同一份积分;API 是另一套开放平台积分。CLI 默认把模型设为"公开",这次全部加了 `--visibility private`。
- Studio 的贴图是单独一步(贴图模型 v3.5-20260815);P2.0 直接给 5 万面左右的低面数模型和一张 8K 颜色贴图。
- `raw-vs-scene-budget.jpg`、`decimation-methods.jpg`:场景里近看的"碎裂、黏连"主要来自 Blender 合并减面撕开了贴图接缝,不是生成本身。

文件:原始模型在 `assets/generated/compare/<api|cli|studio>/`(不入库),清单 `assets/generated/compare/manifest.json` 由 `tools/compare-manifest.py` 生成;生成脚本 `tools/tripo-compare.sh`(带余额与用时记录),静态对比图 `tools/tripo-compare-report.py`。

## 盲评(2026-10-19,Grok 与 Codex,只看 `blind/` 里打乱顺序、去掉来源的图;对应关系见 `blind/key.json`)

| | Codex 排名(四项共 40 分) | Grok |
|---|---|---|
| 收音机 | CLI 35 > API 早先(贴图 v3.5+去光照)33 > Studio H3.1 分部件 32 > API 30 > Studio H3.1 29 > Studio P2.0 23 | API 早先"结构最准",分部件"整体最自然" |
| 机器人 | Studio H3.1 34 > Studio P2.0 32 > CLI 30 > API 29 | 选 Studio P2.0("没有问题") |

- Codex 对 Studio H3.1 收音机(10.5 万面)的意见:中间那组电子管被抹平简化;对 P2.0 收音机:金属底盘大面积缺失、面板弯曲。
- 机器人 P2.0:Codex 指出双手之间的改锥不完整、握持关系含糊(和我看到的穿插错位一致);Grok 认为它没有问题。
- 两家与我一致的地方:主角近景的机器人选 Studio H3.1;P2.0 收音机最差。我原先认为 Studio H3.1 收音机"近看和 190 万面版本差不多",两家都不同意,已更正为"最省面数,但近看不如 190 万面的版本"。
