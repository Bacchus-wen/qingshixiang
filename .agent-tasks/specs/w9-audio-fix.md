# 任务:修复两条音频断言失败(写任务,只写代码,不要启动任何程序)

Claude 在沙箱外运行了 `node tools/audio-render.mjs`,完整输出在 `.agent-tasks/specs/w7-audio-run.log`。
失败两项(其余全部通过):
1. memoryCut50ms=false:光锥离开后 50ms 段 rms≈0.00018、peak≈0.00106。"立即切断"要求混响尾音也切断:记忆层的混响发送应在门控之前,或者门控同时作用于干声和湿声。
2. thunderLowEnd=false:雷声 lowRatio≈0.47。请检查断言阈值是否合理(雷声本应以低频为主),让雷声低频更沉,或把断言改成符合"沉"的合理定义,并在交回中说明取舍。
不要动其他行为。验收:语法检查和 Node 控制测试通过;Claude 会再跑一次 audio-render。
权限:写任务,只能改 src/systems/audio/**、tools/audio-render.mjs。不联网,不得调用付费生成。交回中文 150 字以内。
