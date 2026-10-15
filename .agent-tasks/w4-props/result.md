已新增 `tools/blender/props.py`、`tools/blender/render_props.py`，仅改这两个文件。

- `python3 -m py_compile` 通过；GLB 命名、灰度材质和无贴图校验逻辑检查通过。
- 预期生成 `assets/models/props/` 下 8 个 GLB：car、vending、umbrella_broken、umbrella_open、ac_unit、debris、lamp_head、traffic_light。
- 检查图输出为 `renders/props_sheet.png`，1600×900、三点光、中灰背景。

未运行 Blender。实际体积、面数及视觉效果待 Claude 验收；导出脚本会检查预算，超限报错。