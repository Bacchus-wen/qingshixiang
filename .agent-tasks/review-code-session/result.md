问题 2 个

1. [src/systems/shop/story.js:199](/Users/wenbin/Games/新游戏/src/systems/shop/story.js:199)：工作台避让只检查缩放终点。朝左停留约 4 秒，目标位置单帧跳约 0.76 米，缓动镜头仍穿过工作台禁区，造成突然推进。建议检查移动线段，并在缓动及头部避让后重新约束实际位置。

2. [src/systems/shop/story.js:158](/Users/wenbin/Games/新游戏/src/systems/shop/story.js:158)：等待时未按住就将 `failHold` 设为 `false`，首次失败时的 `=== undefined` 条件因此不成立。玩家持续按住却看到“再按住一次”，缺失必须先松开的提示，可能停在第一幕。建议在首次失败的状态切换时记录是否仍按住，之后松开再清除。