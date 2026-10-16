已新增 wind 系统并放在 rain 前：阵风、衣物／纸张／电线摆动、32片纸屑与塑料袋、檐口滴水、玻璃雨痕。构建及逻辑检查通过，实际 GLB 衣物固定端已验证；画面待 Claude 验收。

Claude 需在 details.js 合并前给以下网格加 `userData.dynamic = true`：

- `garment_shirt`、`garment_trousers`、`garment_towel`
- `cable()` 创建的电线 Mesh

通知纸已有标记。调试：`?windGust=1`。未启动浏览器、Vite 服务或 Blender；沙箱无法读取进程列表。