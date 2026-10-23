# 残破版参考图(2026-10-23)

- 工具:用户的 Codex 订阅自带的生图(用户确认:"生图就是用codex,我有订阅,可以生图"),由 team-sync 派给 Codex CLI(`--gen`),任务单 `.agent-tasks/gen-broken-props.md`、`gen-broken-props-2.md`。
- 方式:图生图,参考图是原模型的参考图 `assets/generated/shop/refs/<名字>.png`,只改新旧;1024×1024,不透明浅灰底;每件 4 张(用户选"每件 4 张挑 1")。提示词全文见 `docs/broken-props-prompts.md`。
- 选中:`crt_tv/1.png`、`wall_clock/2.png`、`desk_fan/2.png`、`tube_radio_closed/2.png`。
- 图片只留在本地(.gitignore),这份说明入库。
- 三维:Tripo API(`tools/tripo4.py`),v3.1、精细几何、v3.5 高清 PBR、去光照。电视、收音机单图建模(收音机原计划四视角,但四视角把木头的破旧"修好"了,用户同意改单图);摆钟、台扇四视角建模。台账在 `assets/generated/tripo4/<op>/ledger.json`,共 270 积分。
